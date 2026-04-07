/**
 * VIP Suite — Router Auto Instagram
 * Gerencia configurações, bot, logs, aprovações e stories por unidade.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  igConfig, igActivityLogs, igBotStats, igApprovalQueue,
  igStoryReplyConfig, igStoryReplyLog, igRepliedComments,
} from "../../drizzle/schema";
import { eq, and, desc, gte, lte, sql, like } from "drizzle-orm";
import {
  startBot, stopBot, runCycleNow, getBotStatus, generateReply,
} from "../igScheduler";

const META_BASE = "https://graph.facebook.com/v19.0";

async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error(`Meta API: ${JSON.stringify(data.error)}`);
  return data;
}

// ─── Config Router ────────────────────────────────────────────────────────────

export const igConfigRouter = router({
  getConfig: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(igConfig).where(eq(igConfig.unitId, input.unitId)).limit(1);
      return rows[0] ?? null;
    }),

  saveConfig: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      accessToken: z.string().optional(),
      instagramUserId: z.string().optional(),
      checkIntervalMinutes: z.number().min(1).max(60).optional(),
      personalityPrompt: z.string().optional(),
      storyPersonalityPrompt: z.string().optional(),
      maxRepliesPerCycle: z.number().min(1).max(50).optional(),
      skipOwnComments: z.boolean().optional(),
      requireApproval: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unitId, skipOwnComments, requireApproval, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (skipOwnComments !== undefined) updateData.skipOwnComments = skipOwnComments ? 1 : 0;
      if (requireApproval !== undefined) updateData.requireApproval = requireApproval ? 1 : 0;

      const existing = await db.select().from(igConfig).where(eq(igConfig.unitId, unitId)).limit(1);
      if (existing.length > 0) {
        await db.update(igConfig).set(updateData).where(eq(igConfig.unitId, unitId));
      } else {
        await db.insert(igConfig).values({ unitId, ...updateData });
      }
      return { success: true };
    }),

  testConnection: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(igConfig).where(eq(igConfig.unitId, input.unitId)).limit(1);
      const config = rows[0];
      if (!config?.accessToken || !config?.instagramUserId) {
        return { success: false, message: "Credenciais não configuradas. Preencha o Access Token e o ID da Conta em Configurações." };
      }
      // Limpar espaços e aspas extras
      const token = config.accessToken.trim().replace(/^"|"$/g, "");
      const userId = config.instagramUserId.trim().replace(/^"|"$/g, "");
      // Detectar token IGAA (curta duração, não suportado pela Graph API)
      if (token.startsWith("IGAA")) {
        return {
          success: false,
          message: 'Token inválido: tokens que começam com "IGAA" são de curta duração e expiram em 1 hora. Use um token de longa duração que começa com "EAA". Para gerar: acesse developers.facebook.com → Ferramentas → Graph API Explorer → selecione seu App → gere token com permissões instagram_basic, instagram_manage_comments, pages_read_engagement → clique em "Gerar Token de Longa Duração" (válido por 60 dias).',
        };
      }
      try {
        const data = await metaGet(`/${userId}`, token, {
          fields: "id,username,name,followers_count,media_count,profile_picture_url",
        });
        // Atualizar igConfig com token limpo (sem aspas/espaços)
        await db.update(igConfig).set({ accessToken: token, instagramUserId: userId }).where(eq(igConfig.unitId, input.unitId));
        return {
          success: true,
          message: "Conexão bem-sucedida",
          account: data,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("190") || msg.includes("OAuthException") || msg.includes("Cannot parse") || msg.includes("Invalid OAuth")) {
          return { success: false, message: `Token inválido ou expirado. Gere um novo token de longa duração no Meta Developer Portal (deve começar com "EAA"). Detalhe técnico: ${msg}` };
        }
        if (msg.includes("100") || msg.includes("Invalid parameter")) {
          return { success: false, message: `ID da Conta inválido. Verifique o Instagram Business Account ID (número de 17 dígitos). Detalhe técnico: ${msg}` };
        }
        return { success: false, message: msg };
      }
    }),

  getStatus: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(igConfig).where(eq(igConfig.unitId, input.unitId)).limit(1);
      const config = rows[0];
      const schedulerStatus = getBotStatus(input.unitId);
      return {
        isConfigured: !!(config?.accessToken && config?.instagramUserId),
        isActive: !!(config?.isActive),
        isRunning: schedulerStatus.running,
        startedAt: schedulerStatus.startedAt,
        lastRun: schedulerStatus.lastRun ?? config?.lastRunAt ?? null,
        nextRun: schedulerStatus.nextRun,
        checkIntervalMinutes: config?.checkIntervalMinutes ?? 5,
        requireApproval: !!(config?.requireApproval),
      };
    }),

  startBot: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input }) => {
      return startBot(input.unitId);
    }),

  stopBot: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input }) => {
      return stopBot(input.unitId);
    }),

  runCycleNow: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input }) => {
      return runCycleNow(input.unitId);
    }),
});

// ─── Dashboard / Stats Router ─────────────────────────────────────────────────

export const igDashboardRouter = router({
  getStats: protectedProcedure
    .input(z.object({ unitId: z.number(), days: z.number().default(7) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const since = new Date();
      since.setDate(since.getDate() - input.days);
      const sinceStr = since.toISOString().split("T")[0];

      const stats = await db.select().from(igBotStats)
        .where(and(eq(igBotStats.unitId, input.unitId), gte(igBotStats.date, sinceStr as unknown as Date)));

      const totals = stats.reduce((acc, s) => ({
        replies: acc.replies + (s.repliesCount ?? 0),
        stories: acc.stories + (s.storiesReplied ?? 0),
        errors: acc.errors + (s.errorsCount ?? 0),
        cycles: acc.cycles + (s.cyclesRun ?? 0),
      }), { replies: 0, stories: 0, errors: 0, cycles: 0 });

      const pendingApproval = await db.select({ count: sql<number>`count(*)` })
        .from(igApprovalQueue)
        .where(and(eq(igApprovalQueue.unitId, input.unitId), eq(igApprovalQueue.status, "pending")));

      return {
        ...totals,
        pendingApproval: Number(pendingApproval[0]?.count ?? 0),
        chartData: stats.map(s => ({
          date: s.date,
          replies: s.repliesCount ?? 0,
          stories: s.storiesReplied ?? 0,
          errors: s.errorsCount ?? 0,
        })),
      };
    }),

  getRecentActivity: protectedProcedure
    .input(z.object({ unitId: z.number(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(igActivityLogs)
        .where(eq(igActivityLogs.unitId, input.unitId))
        .orderBy(desc(igActivityLogs.createdAt))
        .limit(input.limit);
    }),
});

// ─── Logs Router ──────────────────────────────────────────────────────────────

export const igLogsRouter = router({
  getList: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
      type: z.enum(["comment_reply", "story_reply", "welcome", "error", "info", "warning"]).optional(),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(igActivityLogs.unitId, input.unitId)];
      if (input.type) conditions.push(eq(igActivityLogs.type, input.type));
      if (input.search) conditions.push(like(igActivityLogs.message, `%${input.search}%`));
      if (input.dateFrom) conditions.push(gte(igActivityLogs.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(igActivityLogs.createdAt, new Date(input.dateTo)));

      const offset = (input.page - 1) * input.pageSize;
      const [rows, countResult] = await Promise.all([
        db.select().from(igActivityLogs).where(and(...conditions))
          .orderBy(desc(igActivityLogs.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(igActivityLogs).where(and(...conditions)),
      ]);
      return { rows, total: Number(countResult[0]?.count ?? 0), page: input.page, pageSize: input.pageSize };
    }),
});

// ─── Approval Router ──────────────────────────────────────────────────────────

export const igApprovalRouter = router({
  getPending: protectedProcedure
    .input(z.object({ unitId: z.number(), page: z.number().default(1), pageSize: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.pageSize;
      const [rows, countResult] = await Promise.all([
        db.select().from(igApprovalQueue)
          .where(and(eq(igApprovalQueue.unitId, input.unitId), eq(igApprovalQueue.status, "pending")))
          .orderBy(desc(igApprovalQueue.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(igApprovalQueue)
          .where(and(eq(igApprovalQueue.unitId, input.unitId), eq(igApprovalQueue.status, "pending"))),
      ]);
      return { rows, total: Number(countResult[0]?.count ?? 0) };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number(), editedReply: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(igApprovalQueue).where(eq(igApprovalQueue.id, input.id)).limit(1);
      const item = rows[0];
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const replyText = input.editedReply ?? item.suggestedReply ?? "";
      const configs = await db.select().from(igConfig).where(eq(igConfig.unitId, item.unitId)).limit(1);
      const config = configs[0];
      if (!config?.accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Token não configurado" });

      if (item.type === "comment" && item.commentId) {
        const url = `${META_BASE}/${item.commentId}/replies?access_token=${config.accessToken}`;
        await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: replyText }) });
        await db.insert(igRepliedComments).values({ unitId: item.unitId, commentId: item.commentId });
      }

      await db.update(igApprovalQueue).set({ status: "approved", reviewedAt: new Date(), suggestedReply: replyText }).where(eq(igApprovalQueue.id, input.id));
      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(igApprovalQueue).set({ status: "rejected", reviewedAt: new Date() }).where(eq(igApprovalQueue.id, input.id));
      return { success: true };
    }),
});

// ─── Stories Router ───────────────────────────────────────────────────────────

export const igStoriesRouter = router({
  getConfig: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(igStoryReplyConfig).where(eq(igStoryReplyConfig.unitId, input.unitId)).limit(1);
      return rows[0] ?? null;
    }),

  saveConfig: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      isActive: z.boolean(),
      requireApproval: z.boolean(),
      replyToMentions: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unitId, isActive, requireApproval, replyToMentions } = input;
      const data = { isActive: isActive ? 1 : 0, requireApproval: requireApproval ? 1 : 0, replyToMentions: replyToMentions ? 1 : 0 };
      const existing = await db.select().from(igStoryReplyConfig).where(eq(igStoryReplyConfig.unitId, unitId)).limit(1);
      if (existing.length > 0) {
        await db.update(igStoryReplyConfig).set(data).where(eq(igStoryReplyConfig.unitId, unitId));
      } else {
        await db.insert(igStoryReplyConfig).values({ unitId, ...data });
      }
      return { success: true };
    }),

  getLogs: protectedProcedure
    .input(z.object({ unitId: z.number(), page: z.number().default(1), pageSize: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.pageSize;
      const [rows, countResult] = await Promise.all([
        db.select().from(igStoryReplyLog)
          .where(eq(igStoryReplyLog.unitId, input.unitId))
          .orderBy(desc(igStoryReplyLog.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(igStoryReplyLog).where(eq(igStoryReplyLog.unitId, input.unitId)),
      ]);
      return { rows, total: Number(countResult[0]?.count ?? 0) };
    }),
});

// ─── Prompts Router ───────────────────────────────────────────────────────────

export const igPromptsRouter = router({
  getPrompts: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select({
        personalityPrompt: igConfig.personalityPrompt,
        storyPersonalityPrompt: igConfig.storyPersonalityPrompt,
      }).from(igConfig).where(eq(igConfig.unitId, input.unitId)).limit(1);
      return rows[0] ?? { personalityPrompt: null, storyPersonalityPrompt: null };
    }),

  savePrompts: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      personalityPrompt: z.string().optional(),
      storyPersonalityPrompt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unitId, ...data } = input;
      const existing = await db.select().from(igConfig).where(eq(igConfig.unitId, unitId)).limit(1);
      if (existing.length > 0) {
        await db.update(igConfig).set(data).where(eq(igConfig.unitId, unitId));
      } else {
        await db.insert(igConfig).values({ unitId, ...data });
      }
      return { success: true };
    }),

  testPrompt: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      commentText: z.string(),
      promptType: z.enum(["comment", "story"]).default("comment"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(igConfig).where(eq(igConfig.unitId, input.unitId)).limit(1);
      const config = rows[0];
      const prompt = input.promptType === "story" ? config?.storyPersonalityPrompt : config?.personalityPrompt;
      try {
        const reply = await generateReply(input.commentText, prompt);
        return { success: true, reply };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, reply: null, error: msg };
      }
    }),
});
