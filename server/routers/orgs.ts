import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { igConfig } from "../../drizzle/schema";
import {
  getOrgsByOwner,
  getOrgsByMember,
  createOrg,
  getOrgById,
  updateOrg,
  getUnitsByOrg,
  getUnitById,
  createUnit,
  updateUnit,
  getUserProfile,
  upsertUserProfile,
  getUsersInOrg,
  getModuleConfigs,
  upsertModuleConfig,
  getModuleAccess,
  upsertModuleAccess,
} from "../db";

// ── Middleware: ensure user has a profile in the org ──────────────────────────
// sysAdmin = user.role === 'admin' in the users table → always gets master access
const MASTER_PROFILE = {
  id: 0,
  userId: 0,
  orgId: 0,
  unitId: null,
  role: "master" as const,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

async function requireOrgAccess(
  userId: number,
  orgId: number,
  isSysAdmin = false
) {
  if (isSysAdmin) return { ...MASTER_PROFILE, userId, orgId };
  const profile = await getUserProfile(userId, orgId);
  if (!profile) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta organização" });
  }
  return profile;
}

async function requireMasterOrOrgAdmin(
  userId: number,
  orgId: number,
  isSysAdmin = false
) {
  if (isSysAdmin) return { ...MASTER_PROFILE, userId, orgId };
  const profile = await getUserProfile(userId, orgId);
  if (!profile || !["master", "org_admin"].includes(profile.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem realizar esta ação" });
  }
  return profile;
}

export const orgsRouter = router({
  // ── Organizations ─────────────────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    // sysAdmin sees all orgs they own OR are a member of
    if (ctx.user.role === "admin") {
      return getOrgsByOwner(ctx.user.id);
    }
    return getOrgsByMember(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireOrgAccess(ctx.user.id, input.orgId, ctx.user.role === "admin");
      return getOrgById(input.orgId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
        segment: z.string().optional(),
        primaryColor: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await createOrg({ ...input, ownerId: ctx.user.id });
      // Auto-assign master role to creator
      await upsertUserProfile({
        userId: ctx.user.id,
        orgId: org.id,
        role: "master",
        active: true,
      });
      return org;
    }),

  update: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        name: z.string().min(2).optional(),
        segment: z.string().optional(),
        primaryColor: z.string().optional(),
        logoUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId);
      const { orgId, ...data } = input;
      return updateOrg(orgId, data);
    }),

  // ── Units ─────────────────────────────────────────────────────────────────
  units: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const profile = await requireOrgAccess(ctx.user.id, input.orgId, ctx.user.role === "admin");
      const units = await getUnitsByOrg(input.orgId);
      // Non-master/admin: filter to only their unit
      if (!["master", "org_admin"].includes(profile.role) && profile.unitId) {
        return units.filter((u) => u.id === profile.unitId);
      }
      return units;
    }),

  createUnit: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        name: z.string().min(2),
        slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().max(2).optional(),
        phone: z.string().optional(),
        externalId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId, ctx.user.role === "admin");
      return createUnit(input);
    }),

  updateUnit: protectedProcedure
    .input(
      z.object({
        unitId: z.number(),
        orgId: z.number(),
        name: z.string().min(2).optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().max(2).optional(),
        phone: z.string().optional(),
        externalId: z.string().optional(),
        active: z.boolean().optional(),
        aiPrompt: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId, ctx.user.role === "admin");
      const { unitId, orgId, ...data } = input;
      return updateUnit(unitId, data);
    }),

  getUnitAiPrompt: protectedProcedure
    .input(z.object({ unitId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId, ctx.user.role === "admin");
      const unit = await getUnitById(input.unitId);
      return { aiPrompt: unit?.aiPrompt ?? null };
    }),

  // ── User Profiles ─────────────────────────────────────────────────────────
  myProfile: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      // sysAdmin always has master access — return a virtual master profile if no real one exists
      const profile = await getUserProfile(ctx.user.id, input.orgId);
      if (!profile && ctx.user.role === "admin") {
        return { ...MASTER_PROFILE, userId: ctx.user.id, orgId: input.orgId };
      }
      return profile ?? null;
    }),

  orgUsers: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId, ctx.user.role === "admin");
      return getUsersInOrg(input.orgId);
    }),

  setUserProfile: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        targetUserId: z.number(),
        unitId: z.number().nullable().optional(),
        role: z.enum(["master", "org_admin", "unit_manager", "team_lead", "colaborador"]),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId, ctx.user.role === "admin");
      return upsertUserProfile({
        userId: input.targetUserId,
        orgId: input.orgId,
        unitId: input.unitId ?? undefined,
        role: input.role,
        active: input.active ?? true,
      });
    }),

  // ── Module Configs (API keys per unit) ────────────────────────────────────
  moduleConfigs: protectedProcedure
    .input(z.object({ unitId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const profile = await requireOrgAccess(ctx.user.id, input.orgId, ctx.user.role === "admin");
      if (!["master", "org_admin", "unit_manager"].includes(profile.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return getModuleConfigs(input.unitId);
    }),

  saveModuleConfig: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        unitId: z.number(),
        module: z.enum(["data_vip", "gestao_total", "vip_cam", "reputacao", "auto_instagram", "we_send"]),
        config: z.record(z.string(), z.unknown()),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId, ctx.user.role === "admin");
      await upsertModuleConfig({
        unitId: input.unitId,
        module: input.module,
        config: input.config,
        active: input.active ?? true,
      });
      // Se for auto_instagram, sincroniza também com igConfig (tabela usada pelo bot)
      if (input.module === "auto_instagram") {
        const cfg = input.config as Record<string, string>;
        const token = cfg.instagramToken;
        const accountId = cfg.instagramAccountId;
        if (token || accountId) {
          const db = await (await import("../db")).getDb();
          if (db) {
            const existing = await db.select({ id: igConfig.id })
              .from(igConfig)
              .where(eq(igConfig.unitId, input.unitId))
              .limit(1);
            const updateData: Record<string, unknown> = {};
            if (token) updateData.accessToken = token;
            if (accountId) updateData.instagramUserId = accountId;
            if (existing.length > 0) {
              await db.update(igConfig).set(updateData).where(eq(igConfig.unitId, input.unitId));
            } else {
              await db.insert(igConfig).values({ unitId: input.unitId, ...updateData });
            }
          }
        }
      }
      return null;
    }),

  moduleAccess: protectedProcedure
    .input(z.object({ unitId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireOrgAccess(ctx.user.id, input.orgId, ctx.user.role === "admin");
      return getModuleAccess(input.unitId);
    }),

  setModuleAccess: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        unitId: z.number(),
        module: z.enum(["data_vip", "gestao_total", "vip_cam", "reputacao", "auto_instagram", "we_send"]),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId, ctx.user.role === "admin");
      return upsertModuleAccess({
        unitId: input.unitId,
        module: input.module,
        enabled: input.enabled,
      });
    }),
});
