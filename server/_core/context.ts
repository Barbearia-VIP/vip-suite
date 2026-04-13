import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { jwtVerify } from "jose";
import { ENV } from "./env";
import { getDb } from "../db";
import { sysUsers, sysUserUnits, sysRolePermissions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type SysUserContext = {
  id: number;
  name: string;
  email: string;
  orgId: number;
  roleId: number | null;
  allowedUnitIds: number[];
  permissions: Array<{ moduleKey: string; sectionKey: string; canView: number; canEdit: number }>;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  sysUser: SysUserContext | null;
};

const SYS_COOKIE = "sys_session";

async function verifySysSession(token: string | undefined | null): Promise<{ sysUserId: number; orgId: number } | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret + "_sys");
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const { sysUserId, orgId } = payload as Record<string, unknown>;
    if (typeof sysUserId !== "number" || typeof orgId !== "number") return null;
    return { sysUserId, orgId };
  } catch (e: any) {
    console.error('[SysSession] Erro ao verificar token:', e?.message);
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let sysUser: SysUserContext | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }

  // Se não há sessão OAuth, verificar sessão de sysUser
  if (!user) {
    try {
      // Ler cookie diretamente do header (sem depender do cookie-parser)
      const rawCookies = opts.req.headers.cookie ?? "";
      const sysToken = rawCookies
        .split(";")
        .map(c => c.trim())
        .find(c => c.startsWith(SYS_COOKIE + "="))
        ?.split("=").slice(1).join("=") ?? null;
      const session = await verifySysSession(sysToken);
      if (session) {
        const db = await getDb();
        if (db) {
          const rows = await db.select().from(sysUsers).where(eq(sysUsers.id, session.sysUserId)).limit(1);
          const u = rows[0];
          if (u) {
            // Buscar unidades permitidas
            const unitRows = await db.select().from(sysUserUnits).where(eq(sysUserUnits.sysUserId, u.id));
            const allowedUnitIds = unitRows.map((r: any) => r.unitId);
            // Buscar permissões do perfil
            let permissions: SysUserContext["permissions"] = [];
            if (u.roleId) {
              const permRows = await db.select().from(sysRolePermissions).where(eq(sysRolePermissions.roleId, u.roleId));
              permissions = permRows.map((p: any) => ({
                moduleKey: p.moduleKey,
                sectionKey: p.sectionKey,
                canView: p.canView,
                canEdit: p.canEdit,
              }));
            }
            sysUser = {
              id: u.id,
              name: u.name,
              email: u.email,
              orgId: u.orgId ?? session.orgId,
              roleId: u.roleId,
              allowedUnitIds,
              permissions,
            };
          }
        }
      }
    } catch {
      sysUser = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    sysUser,
  };
}
