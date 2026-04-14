/**
 * VIP Suite — Instagram Bot Scheduler
 * Gerencia os bots de resposta automática por unidade.
 * Persiste em memória no servidor Node.js.
 * Reinicia automaticamente ao ligar o servidor para unidades com isActive = true.
 */

import { getDb } from "./db";
import { igConfig, igActivityLogs, igBotStats, igRepliedComments, igApprovalQueue, igStoryReplyConfig, igStoryReplyLog } from "../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SchedulerEntry {
  intervalId: ReturnType<typeof setInterval>;
  running: boolean;
  startedAt: Date;
  lastRun: Date | null;
  nextRun: Date | null;
  unitId: number;
  repliedCommentIds: Set<string>;
}

const schedulers = new Map<number, SchedulerEntry>();

// ─── Spam Detection ──────────────────────────────────────────────────────────

const SPAM_KEYWORDS = [
  "seguidores grátis", "followers free", "comprar seguidores",
  "ganhe dinheiro fácil", "clique no link", "sorteio fake",
  "follow back", "f4f", "l4l", "dm me", "check my profile",
  "visit my page", "free followers", "buy followers",
];

export function isSpam(text: string): boolean {
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

export function isEmojiOnly(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  const withoutEmojis = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g, "").trim();
  return withoutEmojis.length === 0 && text.trim().length > 0;
}

// ─── Meta API Helpers ────────────────────────────────────────────────────────

const META_BASE = "https://graph.facebook.com/v19.0";

async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error(`Meta API error: ${JSON.stringify(data.error)}`);
  return data;
}

async function metaPost(path: string, token: string, body: Record<string, unknown>) {
  const url = `${META_BASE}${path}?access_token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error(`Meta API error: ${JSON.stringify(data.error)}`);
  return data;
}

// ─── LLM Reply Generation ────────────────────────────────────────────────────

const DEFAULT_PROMPT = `Você é um representante autêntico e simpático da Barbearia VIP.
Ao responder comentários no Instagram:
- Seja breve (máximo 2 frases curtas)
- Use linguagem natural e próxima, como se estivesse conversando
- Adicione 1-2 emojis relevantes (não exagere)
- Se o comentário fizer uma pergunta, responda diretamente
- Se for um elogio, agradeça com humildade e devolva valor
- Se for uma crítica construtiva, reconheça e mostre abertura
- NUNCA responda spam, ofensas ou comentários sem sentido
- Responda SEMPRE em português do Brasil`;

export async function generateReply(commentText: string, personalityPrompt?: string | null): Promise<string> {
  const systemPrompt = personalityPrompt || DEFAULT_PROMPT;
  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Responda este comentário do Instagram: "${commentText}"` },
    ],
  });
  const content = response?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM não retornou resposta");
  return typeof content === "string" ? content.trim() : JSON.stringify(content);
}

// ─── Log Helper ──────────────────────────────────────────────────────────────

async function logActivity(
  unitId: number,
  type: "comment_reply" | "story_reply" | "welcome" | "error" | "info" | "warning",
  message: string,
  metadata?: Record<string, unknown>
) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(igActivityLogs).values({ unitId, type, message, metadata: metadata ?? null });
  } catch { /* silently fail log */ }
}

async function updateDailyStats(unitId: number, updates: { replies?: number; stories?: number; errors?: number; cycles?: number }) {
  try {
    const db = await getDb();
    if (!db) return;
    const today = new Date().toISOString().split("T")[0];
    await db.execute(sql`
      INSERT INTO ig_bot_stats (unitId, date, repliesCount, storiesReplied, errorsCount, cyclesRun)
      VALUES (${unitId}, ${today}, ${updates.replies ?? 0}, ${updates.stories ?? 0}, ${updates.errors ?? 0}, ${updates.cycles ?? 0})
      ON DUPLICATE KEY UPDATE
        repliesCount = repliesCount + ${updates.replies ?? 0},
        storiesReplied = storiesReplied + ${updates.stories ?? 0},
        errorsCount = errorsCount + ${updates.errors ?? 0},
        cyclesRun = cyclesRun + ${updates.cycles ?? 0}
    `);
  } catch { /* silently fail stats */ }
}

// ─── Bot Cycle ───────────────────────────────────────────────────────────────

async function runBotCycle(unitId: number) {
  const db = await getDb();
  if (!db) return;

  const entry = schedulers.get(unitId);
  if (!entry) return;

  try {
    // Buscar configuração
    const configs = await db.select().from(igConfig).where(eq(igConfig.unitId, unitId)).limit(1);
    const config = configs[0];
    if (!config || !config.accessToken || !config.instagramUserId) {
      await logActivity(unitId, "warning", "Bot parado: credenciais não configuradas");
      stopBot(unitId);
      return;
    }

    entry.lastRun = new Date();
    const intervalMs = (config.checkIntervalMinutes ?? 5) * 60 * 1000;
    entry.nextRun = new Date(Date.now() + intervalMs);

    // Atualizar lastRunAt no BD
    await db.update(igConfig).set({ lastRunAt: entry.lastRun }).where(eq(igConfig.unitId, unitId));

    let repliesThisCycle = 0;
    const maxReplies = config.maxRepliesPerCycle ?? 10;

    // ── Buscar posts recentes ──
    let posts: Array<{ id: string; caption?: string; timestamp: string }> = [];
    try {
      const mediaRes = await metaGet(`/${config.instagramUserId}/media`, config.accessToken, {
        fields: "id,caption,timestamp",
        limit: "10",
      });
      posts = (mediaRes.data as typeof posts) ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await logActivity(unitId, "error", `Erro ao buscar posts: ${msg}`);
      await updateDailyStats(unitId, { errors: 1, cycles: 1 });
      return;
    }

    // ── Processar comentários de cada post ──
    for (const post of posts) {
      if (repliesThisCycle >= maxReplies) break;
      try {
        const commentsRes = await metaGet(`/${post.id}/comments`, config.accessToken, {
          fields: "id,text,username,timestamp",
        });
        const comments = (commentsRes.data as Array<{ id: string; text: string; username: string; timestamp: string }>) ?? [];

        for (const comment of comments) {
          if (repliesThisCycle >= maxReplies) break;

          // Verificar se já foi respondido (em memória ou BD)
          if (entry.repliedCommentIds.has(comment.id)) continue;

          // Verificar no BD
          const alreadyReplied = await db.select().from(igRepliedComments)
            .where(and(eq(igRepliedComments.unitId, unitId), eq(igRepliedComments.commentId, comment.id)))
            .limit(1);
          if (alreadyReplied.length > 0) {
            entry.repliedCommentIds.add(comment.id);
            continue;
          }

          // Filtrar spam
          if (isSpam(comment.text)) {
            await logActivity(unitId, "info", `Comentário de spam ignorado de @${comment.username}`);
            entry.repliedCommentIds.add(comment.id);
            continue;
          }

          // Gerar resposta via LLM
          let replyText: string;
          try {
            replyText = await generateReply(comment.text, config.personalityPrompt);
          } catch {
            await logActivity(unitId, "error", `Erro ao gerar resposta para comentário ${comment.id}`);
            continue;
          }

          // Aprovação manual ou envio direto
          if (config.requireApproval) {
            await db.insert(igApprovalQueue).values({
              unitId,
              type: "comment",
              commentId: comment.id,
              postId: post.id,
              authorName: comment.username,
              commentText: comment.text,
              suggestedReply: replyText,
              status: "pending",
            });
            await logActivity(unitId, "info", `Resposta enviada para aprovação: @${comment.username}`);
          } else {
            try {
              await metaPost(`/${comment.id}/replies`, config.accessToken, { message: replyText });
              await db.insert(igRepliedComments).values({ unitId, commentId: comment.id });
              entry.repliedCommentIds.add(comment.id);
              repliesThisCycle++;
              await logActivity(unitId, "comment_reply", `Respondido @${comment.username}: "${comment.text}"`, {
                commentId: comment.id, postId: post.id, reply: replyText,
              });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              await logActivity(unitId, "error", `Erro ao responder comentário ${comment.id}: ${msg}`);
              await updateDailyStats(unitId, { errors: 1 });
            }
          }
        }
      } catch { /* continue with next post */ }
    }

    // ── Processar Stories (se configurado) ──
    const storyConfigs = await db.select().from(igStoryReplyConfig).where(eq(igStoryReplyConfig.unitId, unitId)).limit(1);
    const storyConfig = storyConfigs[0];
    let storiesReplied = 0;

    if (storyConfig?.isActive) {
      try {
        const convRes = await metaGet("/me/conversations", config.accessToken, {
          platform: "instagram",
          fields: "messages{message,from,story}",
        });
        const conversations = (convRes.data as Array<{ messages?: { data: Array<{ message?: string; from?: { id: string }; story?: { id: string; url?: string } }> } }>) ?? [];

        for (const conv of conversations) {
          const messages = conv.messages?.data ?? [];
          for (const msg of messages) {
            if (!msg.story?.id) continue;
            if (!msg.from?.id) continue;

            // Verificar se já foi respondido
            const alreadyReplied = await db.select().from(igStoryReplyLog)
              .where(and(eq(igStoryReplyLog.unitId, unitId), eq(igStoryReplyLog.storyId, msg.story.id)))
              .limit(1);
            if (alreadyReplied.length > 0) continue;

            const incomingText = msg.message ?? "";
            const storyPrompt = config.storyPersonalityPrompt || config.personalityPrompt;
            let replyText: string;
            try {
              replyText = await generateReply(incomingText || "respondeu ao seu story", storyPrompt);
            } catch { continue; }

            if (storyConfig.requireApproval) {
              await db.insert(igApprovalQueue).values({
                unitId, type: "story",
                commentId: msg.story.id,
                authorName: msg.from.id,
                commentText: incomingText,
                suggestedReply: replyText,
                status: "pending",
              });
            } else {
              try {
                await metaPost("/me/messages", config.accessToken, {
                  recipient: { id: msg.from.id },
                  message: { text: replyText },
                });
                await db.insert(igStoryReplyLog).values({
                  unitId,
                  senderId: msg.from.id,
                  storyId: msg.story.id,
                  storyUrl: msg.story.url,
                  incomingText,
                  replyText,
                  isMention: 0,
                  status: "success",
                });
                storiesReplied++;
                await logActivity(unitId, "story_reply", `Story respondido para ${msg.from.id}`);
              } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await db.insert(igStoryReplyLog).values({
                  unitId, senderId: msg.from.id, storyId: msg.story.id,
                  incomingText, replyText, status: "failed", errorMessage: errMsg,
                });
                await updateDailyStats(unitId, { errors: 1 });
              }
            }
          }
        }
      } catch { /* story processing failed silently */ }
    }

    await updateDailyStats(unitId, { replies: repliesThisCycle, stories: storiesReplied, cycles: 1 });

    if (repliesThisCycle > 0 || storiesReplied > 0) {
      await logActivity(unitId, "info", `Ciclo concluído: ${repliesThisCycle} comentários, ${storiesReplied} stories respondidos`);
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await logActivity(unitId, "error", `Erro crítico no ciclo: ${msg}`);
    await updateDailyStats(unitId, { errors: 1 });
  }
}

// ─── Scheduler Control ───────────────────────────────────────────────────────

export function getBotStatus(unitId: number) {
  const entry = schedulers.get(unitId);
  if (!entry) return { running: false, startedAt: null, lastRun: null, nextRun: null };
  return {
    running: entry.running,
    startedAt: entry.startedAt,
    lastRun: entry.lastRun,
    nextRun: entry.nextRun,
  };
}

export async function startBot(unitId: number): Promise<{ success: boolean; message: string }> {
  if (schedulers.has(unitId)) {
    return { success: false, message: "Bot já está rodando" };
  }

  const db = await getDb();
  if (!db) return { success: false, message: "Banco de dados indisponível" };

  const configs = await db.select().from(igConfig).where(eq(igConfig.unitId, unitId)).limit(1);
  const config = configs[0];
  if (!config?.accessToken || !config?.instagramUserId) {
    return { success: false, message: "Configure as credenciais da API antes de iniciar o bot" };
  }

  const intervalMs = (config.checkIntervalMinutes ?? 5) * 60 * 1000;
  const now = new Date();

  const entry: SchedulerEntry = {
    intervalId: setInterval(() => runBotCycle(unitId), intervalMs),
    running: true,
    startedAt: now,
    lastRun: null,
    nextRun: new Date(Date.now() + intervalMs),
    unitId,
    repliedCommentIds: new Set(),
  };

  schedulers.set(unitId, entry);

  // Marcar como ativo no BD
  await db.update(igConfig).set({ isActive: 1, startedAt: now }).where(eq(igConfig.unitId, unitId));
  await logActivity(unitId, "info", "Bot iniciado");

  // Executar primeiro ciclo imediatamente
  runBotCycle(unitId).catch(() => {});

  return { success: true, message: "Bot iniciado com sucesso" };
}

export async function stopBot(unitId: number): Promise<{ success: boolean; message: string }> {
  const entry = schedulers.get(unitId);
  if (!entry) return { success: false, message: "Bot não está rodando" };

  clearInterval(entry.intervalId);
  schedulers.delete(unitId);

  const db = await getDb();
  if (db) {
    await db.update(igConfig).set({ isActive: 0 }).where(eq(igConfig.unitId, unitId));
    await logActivity(unitId, "info", "Bot pausado");
  }

  return { success: true, message: "Bot pausado com sucesso" };
}

export async function runCycleNow(unitId: number): Promise<{ success: boolean; message: string }> {
  const entry = schedulers.get(unitId);
  if (!entry) {
    // Executar ciclo único sem scheduler
    const db = await getDb();
    if (!db) return { success: false, message: "Banco indisponível" };
    const configs = await db.select().from(igConfig).where(eq(igConfig.unitId, unitId)).limit(1);
    if (!configs[0]?.accessToken) return { success: false, message: "Credenciais não configuradas" };
    await runBotCycle(unitId);
    return { success: true, message: "Ciclo executado (bot pausado)" };
  }
  await runBotCycle(unitId);
  return { success: true, message: "Ciclo forçado com sucesso" };
}

// ─── Auto-restart ao iniciar servidor ────────────────────────────────────────

export async function initSchedulers() {
  try {
    const db = await getDb();
    if (!db) return;

    const activeConfigs = await db.select().from(igConfig).where(eq(igConfig.isActive, 1));
    for (const config of activeConfigs) {
      if (!config.accessToken || !config.instagramUserId) continue;
      const intervalMs = (config.checkIntervalMinutes ?? 5) * 60 * 1000;
      const entry: SchedulerEntry = {
        intervalId: setInterval(() => runBotCycle(config.unitId), intervalMs),
        running: true,
        startedAt: config.startedAt ?? new Date(),
        lastRun: config.lastRunAt ?? null,
        nextRun: new Date(Date.now() + intervalMs),
        unitId: config.unitId,
        repliedCommentIds: new Set(),
      };
      schedulers.set(config.unitId, entry);
      console.log(`[IG Bot] Scheduler reiniciado para unidade ${config.unitId}`);
    }
  } catch (err) {
    console.error("[IG Bot] Erro ao reiniciar schedulers:", err);
  }
}
