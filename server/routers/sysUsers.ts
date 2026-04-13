import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  sysUsers, sysUserUnits, sysRoles, sysRolePermissions, organizations, units,
} from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";

const SYS_COOKIE = "sys_session";
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

// ── Helpers JWT ──────────────────────────────────────────────────────────────
function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret + "_sys");
}

async function signSysSession(payload: { sysUserId: number; orgId: number }) {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(getSecret());
}

async function verifySysSession(token: string | undefined | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { sysUserId, orgId } = payload as Record<string, unknown>;
    if (typeof sysUserId !== "number" || typeof orgId !== "number") return null;
    return { sysUserId, orgId };
  } catch {
    return null;
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

// ── Lista de módulos/seções do sistema ───────────────────────────────────────
export const SYSTEM_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    sections: [{ key: "visao_geral", label: "Visão Geral" }],
  },
  {
    key: "data_vip",
    label: "Data VIP",
    sections: [
      { key: "faturamento", label: "Faturamento" },
      { key: "colaboradores", label: "Colaboradores" },
      { key: "metas", label: "Metas" },
      { key: "servicos", label: "Serviços" },
      { key: "produtos", label: "Produtos" },
      { key: "sync", label: "Sincronização" },
    ],
  },
  {
    key: "gestao_total",
    label: "Gestão Total",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "planejamento", label: "Planejamento" },
      { key: "processos", label: "Processos" },
      { key: "instrucoes", label: "Instruções de Trabalho" },
      { key: "tarefas", label: "Tarefas" },
      { key: "pessoas", label: "Pessoas (Cargos/Colaboradores)" },
      { key: "indicadores", label: "Indicadores" },
      { key: "financeiro", label: "Financeiro" },
      { key: "configuracao_financeira", label: "Configuração Financeira" },
      { key: "marketing", label: "Marketing" },
      { key: "documentos", label: "Documentos" },
      { key: "reunioes", label: "Reuniões" },
      { key: "ia_conselheiro", label: "IA Conselheiro" },
      { key: "configuracoes", label: "Configurações (sem APIs)" },
      { key: "privilegios", label: "Privilégios" },
    ],
  },
  {
    key: "vip_cam",
    label: "VIP Cam",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "ao_vivo", label: "Câmera ao Vivo" },
      { key: "clientes", label: "Clientes" },
      { key: "historico", label: "Histórico" },
      { key: "metricas", label: "Métricas" },
      { key: "configuracoes", label: "Configurações" },
    ],
  },
  {
    key: "reputacao",
    label: "Reputação",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "avaliacoes", label: "Avaliações" },
      { key: "respostas", label: "Respostas" },
      { key: "analise", label: "Análise" },
      { key: "integracoes", label: "Integrações" },
      { key: "config_ia", label: "Config. IA" },
    ],
  },
  {
    key: "auto_instagram",
    label: "Auto Instagram",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "prompts", label: "Editor de Prompts" },
      { key: "aprovacao", label: "Fila de Aprovação" },
      { key: "logs", label: "Logs" },
      { key: "stories", label: "Stories" },
      { key: "diagnostico", label: "Diagnóstico" },
    ],
  },
  {
    key: "we_send",
    label: "We Send",
    sections: [
      { key: "campanhas", label: "Campanhas" },
      { key: "relatorios", label: "Relatórios" },
      { key: "configuracoes", label: "Configurações WAHA" },
    ],
  },
];

// ── Helper: buscar orgId do usuário master ───────────────────────────────────
async function getOrgId(userId: number): Promise<number> {
  const db = await requireDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.ownerId, userId))
    .limit(1);
  if (!org) throw new Error("Organização não encontrada.");
  return org.id;
}

// ── Router ───────────────────────────────────────────────────────────────────
export const sysUsersRouter = router({

  getModules: publicProcedure.query(() => SYSTEM_MODULES),

  // Login por e-mail/senha
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [user] = await db
        .select()
        .from(sysUsers)
        .where(eq(sysUsers.email, input.email.toLowerCase().trim()))
        .limit(1);

      if (!user || !user.active) throw new Error("E-mail ou senha incorretos.");

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new Error("E-mail ou senha incorretos.");

      await db.update(sysUsers).set({ lastLoginAt: new Date() }).where(eq(sysUsers.id, user.id));

      const userUnits = await db
        .select({ unitId: sysUserUnits.unitId })
        .from(sysUserUnits)
        .where(eq(sysUserUnits.sysUserId, user.id));

      let permissions: { moduleKey: string; sectionKey: string; canView: number; canEdit: number }[] = [];
      if (user.roleId) {
        permissions = await db
          .select()
          .from(sysRolePermissions)
          .where(eq(sysRolePermissions.roleId, user.roleId));
      }

      const token = await signSysSession({ sysUserId: user.id, orgId: user.orgId });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(SYS_COOKIE, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        orgId: user.orgId,
        roleId: user.roleId,
        allowedUnitIds: userUnits.map((u: { unitId: number }) => u.unitId),
        permissions,
      };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(SYS_COOKIE, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie ?? "";
    const match = cookies.split(";").find((c: string) => c.trim().startsWith(`${SYS_COOKIE}=`));
    const token = match?.split("=").slice(1).join("=").trim();
    const session = await verifySysSession(token);
    if (!session) return null;

    const db = await requireDb();
    const [user] = await db
      .select()
      .from(sysUsers)
      .where(and(eq(sysUsers.id, session.sysUserId), eq(sysUsers.active, 1)))
      .limit(1);

    if (!user) return null;

    const userUnits = await db
      .select({ unitId: sysUserUnits.unitId })
      .from(sysUserUnits)
      .where(eq(sysUserUnits.sysUserId, user.id));

    let permissions: { moduleKey: string; sectionKey: string; canView: number; canEdit: number }[] = [];
    if (user.roleId) {
      permissions = await db
        .select()
        .from(sysRolePermissions)
        .where(eq(sysRolePermissions.roleId, user.roleId));
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      orgId: user.orgId,
      roleId: user.roleId,
      allowedUnitIds: userUnits.map((u: { unitId: number }) => u.unitId),
      permissions,
    };
  }),

  // ── Buscar unidades da organização (pública — usada por sysUser sem OAuth) ──
  unitsByOrg: publicProcedure
    .input(z.object({ orgId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      // Valida que o chamador tem sessão de sysUser para este orgId
      const cookies = ctx.req.headers.cookie ?? "";
      const match = cookies.split(";").find((c: string) => c.trim().startsWith(`${SYS_COOKIE}=`));
      const token = match?.split("=").slice(1).join("=").trim();
      const session = await verifySysSession(token);
      // Permite acesso se: (a) há sessão sysUser para este orgId, ou (b) usuário OAuth autenticado
      const isAuthorized = (session && session.orgId === input.orgId) || !!ctx.user;
      if (!isAuthorized) return [];

      const db = await requireDb();
      const rows = await db
        .select({
          id: units.id,
          name: units.name,
          slug: units.slug,
          orgId: units.orgId,
          city: units.city,
          state: units.state,
        })
        .from(units)
        .where(eq(units.orgId, input.orgId));
      return rows;
    }),

  // ── Buscar organização por ID (pública — usada por sysUser sem OAuth) ──
  getOrgById: publicProcedure
    .input(z.object({ orgId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      // Valida que o chamador tem sessão de sysUser para este orgId
      const cookies = ctx.req.headers.cookie ?? "";
      const match = cookies.split(";").find((c: string) => c.trim().startsWith(`${SYS_COOKIE}=`));
      const token = match?.split("=").slice(1).join("=").trim();
      const session = await verifySysSession(token);
      const isAuthorized = (session && session.orgId === input.orgId) || !!ctx.user;
      if (!isAuthorized) return null;

      const db = await requireDb();
      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          logoUrl: organizations.logoUrl,
          primaryColor: organizations.primaryColor,
        })
        .from(organizations)
        .where(eq(organizations.id, input.orgId))
        .limit(1);
      return org ?? null;
    }),

  // ── CRUD de Usuários ─────────────────────────────────────────────────────
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx.user!.id);
    const db = await requireDb();
    const userList = await db
      .select({
        id: sysUsers.id,
        name: sysUsers.name,
        email: sysUsers.email,
        roleId: sysUsers.roleId,
        active: sysUsers.active,
        lastLoginAt: sysUsers.lastLoginAt,
        createdAt: sysUsers.createdAt,
      })
      .from(sysUsers)
      .where(eq(sysUsers.orgId, orgId));

    if (userList.length === 0) return [];

    const allUserUnits = await db
      .select()
      .from(sysUserUnits)
      .where(inArray(sysUserUnits.sysUserId, userList.map((u: { id: number }) => u.id)));

    return userList.map((u: typeof userList[0]) => ({
      ...u,
      unitIds: allUserUnits
        .filter((uu: typeof allUserUnits[0]) => uu.sysUserId === u.id)
        .map((uu: typeof allUserUnits[0]) => uu.unitId),
    }));
  }),

  createUser: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      roleId: z.number().optional(),
      unitIds: z.array(z.number()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const orgId = await getOrgId(ctx.user!.id);
      const db = await requireDb();
      const passwordHash = await bcrypt.hash(input.password, 10);

      const [existing] = await db
        .select({ id: sysUsers.id })
        .from(sysUsers)
        .where(and(eq(sysUsers.email, input.email.toLowerCase()), eq(sysUsers.orgId, orgId)))
        .limit(1);

      if (existing) throw new Error("Já existe um usuário com este e-mail.");

      const [result] = await db.insert(sysUsers).values({
        orgId,
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        roleId: input.roleId ?? null,
        active: 1,
      });

      const newId = (result as { insertId: number }).insertId;

      if (input.unitIds.length > 0) {
        await db.insert(sysUserUnits).values(
          input.unitIds.map((unitId: number) => ({ sysUserId: newId, unitId }))
        );
      }

      return { id: newId };
    }),

  updateUser: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      roleId: z.number().nullable().optional(),
      unitIds: z.array(z.number()).optional(),
      active: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const orgId = await getOrgId(ctx.user!.id);
      const db = await requireDb();
      const { id, unitIds, password, ...rest } = input;

      const updates: Record<string, unknown> = { ...rest };
      if (password) updates.passwordHash = await bcrypt.hash(password, 10);
      if (Object.keys(updates).length > 0) {
        await db
          .update(sysUsers)
          .set(updates)
          .where(and(eq(sysUsers.id, id), eq(sysUsers.orgId, orgId)));
      }

      if (unitIds !== undefined) {
        await db.delete(sysUserUnits).where(eq(sysUserUnits.sysUserId, id));
        if (unitIds.length > 0) {
          await db.insert(sysUserUnits).values(
            unitIds.map((unitId: number) => ({ sysUserId: id, unitId }))
          );
        }
      }

      return { success: true };
    }),

  deleteUser: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const orgId = await getOrgId(ctx.user!.id);
      const db = await requireDb();
      await db.delete(sysUserUnits).where(eq(sysUserUnits.sysUserId, input.id));
      await db
        .delete(sysUsers)
        .where(and(eq(sysUsers.id, input.id), eq(sysUsers.orgId, orgId)));
      return { success: true };
    }),

  // ── CRUD de Perfis (Roles) ───────────────────────────────────────────────
  listRoles: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx.user!.id);
    const db = await requireDb();
    const roles = await db
      .select()
      .from(sysRoles)
      .where(eq(sysRoles.orgId, orgId));

    if (roles.length === 0) return [];

    const allPerms = await db
      .select()
      .from(sysRolePermissions)
      .where(inArray(sysRolePermissions.roleId, roles.map((r: { id: number }) => r.id)));

    return roles.map((r: typeof roles[0]) => ({
      ...r,
      permissions: allPerms.filter((p: typeof allPerms[0]) => p.roleId === r.id),
    }));
  }),

  createRole: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      permissions: z.array(z.object({
        moduleKey: z.string(),
        sectionKey: z.string(),
        canView: z.number().default(1),
        canEdit: z.number().default(0),
      })).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const orgId = await getOrgId(ctx.user!.id);
      const db = await requireDb();
      const [result] = await db.insert(sysRoles).values({
        orgId,
        name: input.name,
        description: input.description ?? null,
        isSystem: 0,
      });
      const roleId = (result as { insertId: number }).insertId;

      if (input.permissions.length > 0) {
        await db.insert(sysRolePermissions).values(
          input.permissions.map((p: { moduleKey: string; sectionKey: string; canView: number; canEdit: number }) => ({ roleId, ...p }))
        );
      }

      return { id: roleId };
    }),

  updateRole: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      permissions: z.array(z.object({
        moduleKey: z.string(),
        sectionKey: z.string(),
        canView: z.number(),
        canEdit: z.number(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const orgId = await getOrgId(ctx.user!.id);
      const db = await requireDb();
      const { id, permissions, ...rest } = input;

      if (Object.keys(rest).length > 0) {
        await db
          .update(sysRoles)
          .set(rest)
          .where(and(eq(sysRoles.id, id), eq(sysRoles.orgId, orgId)));
      }

      if (permissions !== undefined) {
        await db.delete(sysRolePermissions).where(eq(sysRolePermissions.roleId, id));
        if (permissions.length > 0) {
          await db.insert(sysRolePermissions).values(
            permissions.map((p: { moduleKey: string; sectionKey: string; canView: number; canEdit: number }) => ({ roleId: id, ...p }))
          );
        }
      }

      return { success: true };
    }),

  deleteRole: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const orgId = await getOrgId(ctx.user!.id);
      const db = await requireDb();
      const [role] = await db
        .select()
        .from(sysRoles)
        .where(and(eq(sysRoles.id, input.id), eq(sysRoles.orgId, orgId)))
        .limit(1);
      if (role?.isSystem) throw new Error("Perfis do sistema não podem ser excluídos.");
      await db.delete(sysRolePermissions).where(eq(sysRolePermissions.roleId, input.id));
      await db
        .delete(sysRoles)
        .where(and(eq(sysRoles.id, input.id), eq(sysRoles.orgId, orgId)));
      return { success: true };
    }),

  seedDefaultRoles: protectedProcedure.mutation(async ({ ctx }) => {
    const orgId = await getOrgId(ctx.user!.id);
    const db = await requireDb();

    const existing = await db
      .select({ id: sysRoles.id })
      .from(sysRoles)
      .where(and(eq(sysRoles.orgId, orgId), eq(sysRoles.isSystem, 1)));

    if (existing.length > 0) return { message: "Perfis padrão já existem." };

    const [result] = await db.insert(sysRoles).values({
      orgId,
      name: "Gestor de Unidade",
      description: "Acesso completo à unidade, exceto configurações de API",
      isSystem: 1,
    });
    const roleId = (result as { insertId: number }).insertId;

    const perms: { roleId: number; moduleKey: string; sectionKey: string; canView: number; canEdit: number }[] = [];
    for (const mod of SYSTEM_MODULES) {
      for (const sec of mod.sections) {
        const isApiConfig = ["configuracoes", "config_ia", "integracoes", "diagnostico"].includes(sec.key);
        perms.push({ roleId, moduleKey: mod.key, sectionKey: sec.key, canView: 1, canEdit: isApiConfig ? 0 : 1 });
      }
    }
     await db.insert(sysRolePermissions).values(perms);
    return { message: "Perfil 'Gestor de Unidade' criado com sucesso.", roleId };
  }),

  // ── Trocar senha (sysUser logado com e-mail/senha) ───────────────────────────
  changePassword: publicProcedure
    .input(z.object({
      currentPassword: z.string().min(1, "Informe a senha atual"),
      newPassword: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Ler cookie sys_session diretamente do header
      const rawCookies = (ctx as any).req?.headers?.cookie ?? "";
      const sysToken = rawCookies
        .split(";")
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith(SYS_COOKIE + "="))
        ?.split("=").slice(1).join("=") ?? null;
      const session = await verifySysSession(sysToken);
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida. Faça login novamente." });
      const db = await requireDb();
      const rows = await db.select().from(sysUsers).where(eq(sysUsers.id, session.sysUserId)).limit(1);
      const u = rows[0];
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      const valid = await bcrypt.compare(input.currentPassword, u.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta." });
      const newHash = await bcrypt.hash(input.newPassword, 10);
      await db.update(sysUsers).set({ passwordHash: newHash }).where(eq(sysUsers.id, u.id));
      return { success: true };
    }),
});
