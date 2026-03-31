import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getOrgsByOwner,
  createOrg,
  getOrgById,
  updateOrg,
  getUnitsByOrg,
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
async function requireOrgAccess(userId: number, orgId: number) {
  const profile = await getUserProfile(userId, orgId);
  if (!profile) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta organização" });
  }
  return profile;
}

async function requireMasterOrOrgAdmin(userId: number, orgId: number) {
  const profile = await getUserProfile(userId, orgId);
  if (!profile || !["master", "org_admin"].includes(profile.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem realizar esta ação" });
  }
  return profile;
}

export const orgsRouter = router({
  // ── Organizations ─────────────────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    return getOrgsByOwner(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireOrgAccess(ctx.user.id, input.orgId);
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
      const profile = await requireOrgAccess(ctx.user.id, input.orgId);
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
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId);
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId);
      const { unitId, orgId, ...data } = input;
      return updateUnit(unitId, data);
    }),

  // ── User Profiles ─────────────────────────────────────────────────────────
  myProfile: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getUserProfile(ctx.user.id, input.orgId);
    }),

  orgUsers: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId);
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
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId);
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
      const profile = await requireOrgAccess(ctx.user.id, input.orgId);
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
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId);
      return upsertModuleConfig({
        unitId: input.unitId,
        module: input.module,
        config: input.config,
        active: input.active ?? true,
      });
    }),

  moduleAccess: protectedProcedure
    .input(z.object({ unitId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireOrgAccess(ctx.user.id, input.orgId);
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
      await requireMasterOrOrgAdmin(ctx.user.id, input.orgId);
      return upsertModuleAccess({
        unitId: input.unitId,
        module: input.module,
        enabled: input.enabled,
      });
    }),
});
