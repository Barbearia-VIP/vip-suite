/**
 * Scheduler de Auto-Resposta de Avaliações
 * Roda a cada hora em background, independente do sistema estar aberto.
 * Para cada unidade com auto-responder ativo:
 *   1. Busca novas avaliações sem resposta no Google
 *   2. Gera resposta com IA usando o prompt da unidade
 *   3. Publica a resposta no Google Business Profile
 */

import { getDb, getUnitById } from "./db";
import {
  repAvaliacoes,
  repConexoes,
  repConfigIA,
  repResumo,
} from "../drizzle/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hora
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ─── Helpers reutilizados do reputacao.ts ────────────────────────────────────

function determineSentimento(nota: number): "positivo" | "neutro" | "negativo" {
  if (nota >= 4) return "positivo";
  if (nota <= 2) return "negativo";
  return "neutro";
}

function getGoogleCredentials(conexao?: { googleClientId?: string | null; googleClientSecret?: string | null } | null) {
  const clientId = conexao?.googleClientId || process.env.GOOGLE_BUSINESS_CLIENT_ID || "";
  const clientSecret = conexao?.googleClientSecret || process.env.GOOGLE_BUSINESS_CLIENT_SECRET || "";
  return { clientId, clientSecret };
}

async function refreshGoogleToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return res.json();
}

async function recalcularResumo(db: any, unitId: number) {
  const todas = await db
    .select({ nota: repAvaliacoes.nota, sentimento: repAvaliacoes.sentimento, plataforma: repAvaliacoes.plataforma, resposta: repAvaliacoes.resposta })
    .from(repAvaliacoes)
    .where(eq(repAvaliacoes.unitId, unitId));
  const total = todas.length;
  const respondidas = todas.filter((r: any) => r.resposta).length;
  const taxaResposta = total > 0 ? (respondidas / total) * 100 : 0;
  const notaMedia = total > 0 ? todas.reduce((s: number, r: any) => s + parseFloat(r.nota), 0) / total : 0;
  await db.insert(repResumo).values({
    unitId,
    notaMedia: String(notaMedia.toFixed(2)),
    totalAvaliacoes: total,
    taxaResposta: String(taxaResposta.toFixed(1)),
    updatedAt: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      notaMedia: String(notaMedia.toFixed(2)),
      totalAvaliacoes: total,
      taxaResposta: String(taxaResposta.toFixed(1)),
      updatedAt: new Date(),
    },
  });
}

// ─── Lógica principal do ciclo ───────────────────────────────────────────────

async function processarAutoRespostaUnidade(unitId: number) {
  const db = await getDb();
  if (!db) return;

  try {
    // 1. Verificar configuração de auto-resposta da unidade
    const [config] = await db.select().from(repConfigIA).where(eq(repConfigIA.unitId, unitId));
    if (!config) return;

    const autoResponderAtivo = config.autoResponder || config.autoResponderPositivas || config.autoResponderNegativas;
    if (!autoResponderAtivo) return;

    // 2. Buscar avaliações sem resposta desta unidade
    const avaliacoesSemResposta = await db.select()
      .from(repAvaliacoes)
      .where(and(
        eq(repAvaliacoes.unitId, unitId),
        isNull(repAvaliacoes.resposta),
      ))
      .limit(20); // Processar até 20 por ciclo para não sobrecarregar

    if (avaliacoesSemResposta.length === 0) return;

    // 3. Buscar conexão Google da unidade
    const [conexao] = await db.select()
      .from(repConexoes)
      .where(and(eq(repConexoes.unitId, unitId), eq(repConexoes.plataforma, "google")))
      .limit(1);

    // 4. Buscar prompt da unidade (aiPrompt da tabela units)
    const unit = await getUnitById(unitId);
    const unitAiPrompt = (unit as any)?.aiPrompt || null;

    // 5. Obter access token Google (com refresh automático)
    let accessToken: string | null = conexao?.googleAccessToken || null;
    if (conexao?.googleRefreshToken) {
      const { clientId, clientSecret } = getGoogleCredentials(conexao);
      const tokenExpiry = conexao.googleTokenExpiry ? new Date(conexao.googleTokenExpiry).getTime() : 0;
      if (!accessToken || Date.now() > tokenExpiry - 60000) {
        const refreshed = await refreshGoogleToken(conexao.googleRefreshToken, clientId, clientSecret);
        if (refreshed.access_token) {
          accessToken = refreshed.access_token;
          await db.update(repConexoes).set({
            googleAccessToken: refreshed.access_token,
            googleTokenExpiry: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000),
          }).where(eq(repConexoes.id, conexao.id));
        }
      }
    }

    let respondidas = 0;
    let erros = 0;

    for (const avaliacao of avaliacoesSemResposta) {
      try {
        const nota = parseFloat(String(avaliacao.nota));
        const sentimento = determineSentimento(nota);

        // Verificar se esta avaliação deve ser respondida conforme configuração
        const deveResponder =
          config.autoResponder ||
          (config.autoResponderPositivas && sentimento === "positivo") ||
          (config.autoResponderNegativas && sentimento === "negativo");

        if (!deveResponder) continue;

        // Gerar resposta com IA
        const nomeEstab = config.nomeEstabelecimento || "Barbearia VIP";
        const nomeProprietario = config.nomeProprietario || "Equipe";
        const tomDesc = config.tom === "formal" ? "formal e profissional" : config.tom === "casual" ? "casual e descontraído" : "amigável e acolhedor";

        // Prioridade: aiPrompt da unidade > promptPersonalizado da config > fallback básico
        const systemPrompt = unitAiPrompt
          ? (config.promptPersonalizado
              ? `${unitAiPrompt}\n\nINSTRUÇÕES ADICIONAIS DESTA UNIDADE:\n${config.promptPersonalizado}\n${config.incluirAssinatura ? `\nAssine como: ${nomeProprietario} — ${nomeEstab}` : ""}`
              : `${unitAiPrompt}\n${config.incluirAssinatura ? `\nAssine como: ${nomeProprietario} — ${nomeEstab}` : ""}`)
          : (config.promptPersonalizado ||
            `Você é o gerente de reputação da ${nomeEstab}. Responda avaliações de clientes de forma ${tomDesc}.
             Seja genuíno, personalizado e nunca use respostas genéricas.
             ${config.incluirAssinatura ? `Assine como: ${nomeProprietario} — ${nomeEstab}` : ""}
             Responda SEMPRE em português brasileiro. Máximo 150 palavras.`);

        const userPrompt = `Avaliação ${sentimento} (${nota}/5 estrelas) de ${avaliacao.autorNome || "Cliente"} na plataforma ${avaliacao.plataforma.toUpperCase()}:
${avaliacao.titulo ? `Título: "${avaliacao.titulo}"` : ""}
${avaliacao.comentario ? `Comentário: "${avaliacao.comentario}"` : "(sem comentário)"}

Gere uma resposta profissional para esta avaliação.`;

        const llmResponse = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemPrompt as string },
            { role: "user" as const, content: userPrompt as string },
          ],
        });

        const respostaGeradaRaw = llmResponse.choices?.[0]?.message?.content;
        const respostaGerada = typeof respostaGeradaRaw === "string" ? respostaGeradaRaw : null;
        if (!respostaGerada) {
          erros++;
          continue;
        }

        // Publicar no Google se tiver conexão e reviewName válido
        let respostaPublicada = false;
        const isValidReviewName = avaliacao.urlAvaliacao?.startsWith("accounts/");
        if (avaliacao.plataforma === "google" && isValidReviewName && accessToken) {
          const googleRes = await fetch(
            `https://mybusiness.googleapis.com/v4/${avaliacao.urlAvaliacao}/reply`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ comment: respostaGerada }),
            }
          );
          if (googleRes.ok) {
            respostaPublicada = true;
          } else {
            const errText = await googleRes.text();
            console.error(`[Reputação Auto] Erro ao publicar no Google (avaliação ${avaliacao.id}):`, errText.substring(0, 200));
          }
        }

        // Salvar resposta no banco
        await db.update(repAvaliacoes)
          .set({
            resposta: respostaGerada,
            respondidoEm: new Date(),
            respondidoPor: "Auto-Resposta IA",
            respostaPublicada,
          })
          .where(eq(repAvaliacoes.id, avaliacao.id));

        respondidas++;
        console.log(`[Reputação Auto] Unidade ${unitId}: respondida avaliação ${avaliacao.id} (${sentimento}, publicada: ${respostaPublicada})`);

        // Pequena pausa entre respostas para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (err) {
        erros++;
        console.error(`[Reputação Auto] Erro ao processar avaliação ${avaliacao.id}:`, err);
      }
    }

    if (respondidas > 0 || erros > 0) {
      console.log(`[Reputação Auto] Unidade ${unitId}: ${respondidas} respondidas, ${erros} erros`);
      await recalcularResumo(db, unitId);
    }

  } catch (err) {
    console.error(`[Reputação Auto] Erro geral na unidade ${unitId}:`, err);
  }
}

async function runAutoRespostaGlobal() {
  const db = await getDb();
  if (!db) return;

  console.log("[Reputação Auto] Iniciando ciclo de auto-resposta...");

  try {
    // Buscar todas as unidades com auto-responder ativo
    const configsAtivas = await db.select({ unitId: repConfigIA.unitId })
      .from(repConfigIA)
      .where(
        sql`(${repConfigIA.autoResponder} = 1 OR ${repConfigIA.autoResponderPositivas} = 1 OR ${repConfigIA.autoResponderNegativas} = 1)`
      );

    if (configsAtivas.length === 0) {
      console.log("[Reputação Auto] Nenhuma unidade com auto-responder ativo.");
      return;
    }

    console.log(`[Reputação Auto] ${configsAtivas.length} unidade(s) com auto-responder ativo.`);

    for (const { unitId } of configsAtivas) {
      await processarAutoRespostaUnidade(unitId);
    }

    console.log("[Reputação Auto] Ciclo concluído.");
  } catch (err) {
    console.error("[Reputação Auto] Erro no ciclo global:", err);
  }
}

// ─── Inicialização ───────────────────────────────────────────────────────────

export async function initReputacaoScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  console.log("[Reputação Auto] Scheduler iniciado — ciclo a cada 1 hora.");

  // Rodar imediatamente na inicialização (com delay de 30s para o servidor estabilizar)
  setTimeout(() => {
    runAutoRespostaGlobal().catch(console.error);
  }, 30 * 1000);

  // Agendar ciclo a cada hora
  schedulerTimer = setInterval(() => {
    runAutoRespostaGlobal().catch(console.error);
  }, INTERVAL_MS);
}

export function stopReputacaoScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Reputação Auto] Scheduler parado.");
  }
}
