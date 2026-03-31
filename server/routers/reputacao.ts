import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  repAvaliacoes,
  repConexoes,
  repResumo,
  repConfigIA,
  repRespostasIA,
} from "../../drizzle/schema";
import { eq, and, desc, sql, like, gte, lte, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { TRPCError } from "@trpc/server";

// ─── Helpers ────────────────────────────────────────────────────────────────

function determineSentimento(nota: number): "positivo" | "neutro" | "negativo" {
  if (nota >= 4) return "positivo";
  if (nota <= 2) return "negativo";
  return "neutro";
}

async function recalcularResumo(db: any, unitId: number) {
  const todas = await db
    .select({ nota: repAvaliacoes.nota, sentimento: repAvaliacoes.sentimento, plataforma: repAvaliacoes.plataforma, resposta: repAvaliacoes.resposta })
    .from(repAvaliacoes)
    .where(eq(repAvaliacoes.unitId, unitId));

  const total = todas.length;
  const notaMedia = total > 0 ? todas.reduce((s: number, r: any) => s + parseFloat(r.nota), 0) / total : 0;
  const respondidas = todas.filter((r: any) => r.resposta).length;
  const taxaResposta = total > 0 ? (respondidas / total) * 100 : 0;

  const dist: Record<string, number> = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  const platMap: Record<string, { total: number; count: number }> = {};
  let pos = 0, neu = 0, neg = 0;

  for (const r of todas) {
    const key = String(Math.round(parseFloat(r.nota)));
    if (dist[key] !== undefined) dist[key]++;
    const p = r.plataforma;
    if (!platMap[p]) platMap[p] = { total: 0, count: 0 };
    platMap[p].total += parseFloat(r.nota);
    platMap[p].count++;
    if (r.sentimento === "positivo") pos++;
    else if (r.sentimento === "negativo") neg++;
    else neu++;
  }

  const notasPorPlataforma: Record<string, { avg: number; count: number }> = {};
  for (const [p, v] of Object.entries(platMap)) {
    notasPorPlataforma[p] = { avg: v.count > 0 ? v.total / v.count : 0, count: v.count };
  }

  await db.insert(repResumo).values({
    unitId,
    totalAvaliacoes: total,
    notaMedia: notaMedia.toFixed(2),
    taxaResposta: taxaResposta.toFixed(2),
    totalPositivas: pos,
    totalNeutras: neu,
    totalNegativas: neg,
    distribuicaoNotas: dist,
    notasPorPlataforma,
    ultimoCalculo: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      totalAvaliacoes: total,
      notaMedia: notaMedia.toFixed(2),
      taxaResposta: taxaResposta.toFixed(2),
      totalPositivas: pos,
      totalNeutras: neu,
      totalNegativas: neg,
      distribuicaoNotas: dist,
      notasPorPlataforma,
      ultimoCalculo: new Date(),
    },
  });
}

// ─── Google Places API (fallback sem OAuth) ──────────────────────────────────

async function fetchGooglePlaceDetails(placeId: string, apiKey: string) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,url&language=pt-BR&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK") {
    return { success: false, error: `Google API: ${data.status} — ${data.error_message || ""}` };
  }
  return { success: true, data: data.result };
}

// ─── Google Business Profile OAuth ──────────────────────────────────────────

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVIEWS_API = "https://mybusiness.googleapis.com/v4";

async function refreshGoogleToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  return res.json();
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const reputacaoRouter = router({

  // ── Dashboard KPIs ────────────────────────────────────────────────────────
  getDashboard: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const resumo = await db.select().from(repResumo).where(eq(repResumo.unitId, input.unitId)).limit(1);
      const r = resumo[0];

      // Últimas 5 avaliações
      const recentes = await db.select().from(repAvaliacoes)
        .where(eq(repAvaliacoes.unitId, input.unitId))
        .orderBy(desc(repAvaliacoes.dataAvaliacao))
        .limit(5);

      // Avaliações sem resposta
      const semResposta = await db.select({ id: repAvaliacoes.id })
        .from(repAvaliacoes)
        .where(and(eq(repAvaliacoes.unitId, input.unitId), sql`${repAvaliacoes.resposta} IS NULL`));

      // Evolução últimos 6 meses
      const evolucao = await db.execute(sql`
        SELECT 
          DATE_FORMAT(dataAvaliacao, '%Y-%m') as mes,
          COUNT(*) as total,
          AVG(CAST(nota AS DECIMAL(3,1))) as media
        FROM rep_avaliacoes
        WHERE unitId = ${input.unitId}
          AND dataAvaliacao >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY mes
        ORDER BY mes ASC
      `);

      return {
        resumo: r || null,
        recentes,
        semResposta: semResposta.length,
        evolucao: (evolucao[0] as unknown as any[]) || [],
      };
    }),

  // ── Listar avaliações ─────────────────────────────────────────────────────
  getAvaliacoes: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      plataforma: z.string().optional(),
      sentimento: z.enum(["positivo", "neutro", "negativo"]).optional(),
      semResposta: z.boolean().optional(),
      busca: z.string().optional(),
      notaMin: z.number().optional(),
      notaMax: z.number().optional(),
      pagina: z.number().default(1),
      limite: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [eq(repAvaliacoes.unitId, input.unitId)];
      if (input.plataforma && input.plataforma !== "todas") {
        conditions.push(eq(repAvaliacoes.plataforma, input.plataforma as any));
      }
      if (input.sentimento) conditions.push(eq(repAvaliacoes.sentimento, input.sentimento));
      if (input.semResposta) conditions.push(sql`${repAvaliacoes.resposta} IS NULL`);
      if (input.busca) conditions.push(like(repAvaliacoes.comentario, `%${input.busca}%`));
      if (input.notaMin !== undefined) conditions.push(gte(repAvaliacoes.nota, String(input.notaMin)));
      if (input.notaMax !== undefined) conditions.push(lte(repAvaliacoes.nota, String(input.notaMax)));

      const offset = (input.pagina - 1) * input.limite;
      const [avaliacoes, totalResult] = await Promise.all([
        db.select().from(repAvaliacoes)
          .where(and(...conditions))
          .orderBy(desc(repAvaliacoes.dataAvaliacao))
          .limit(input.limite)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(repAvaliacoes).where(and(...conditions)),
      ]);

      return {
        avaliacoes,
        total: Number(totalResult[0]?.count || 0),
        paginas: Math.ceil(Number(totalResult[0]?.count || 0) / input.limite),
      };
    }),

  // ── Adicionar avaliação manual ────────────────────────────────────────────
  addAvaliacao: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      plataforma: z.enum(["google", "ifood", "tripadvisor", "ubereats", "rappi", "facebook", "instagram", "manual"]),
      autorNome: z.string().optional(),
      nota: z.number().min(1).max(5),
      titulo: z.string().optional(),
      comentario: z.string().optional(),
      dataAvaliacao: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const sentimento = determineSentimento(input.nota);
      await db.insert(repAvaliacoes).values({
        unitId: input.unitId,
        plataforma: input.plataforma,
        autorNome: input.autorNome,
        nota: String(input.nota),
        titulo: input.titulo,
        comentario: input.comentario,
        sentimento,
        dataAvaliacao: new Date(input.dataAvaliacao),
      });

      await recalcularResumo(db, input.unitId);
      return { success: true };
    }),

  // ── Responder avaliação ───────────────────────────────────────────────────
  responderAvaliacao: protectedProcedure
    .input(z.object({
      avaliacaoId: z.number(),
      unitId: z.number(),
      resposta: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(repAvaliacoes)
        .set({
          resposta: input.resposta,
          respondidoEm: new Date(),
          respondidoPor: ctx.user.name || "Equipe",
        })
        .where(and(eq(repAvaliacoes.id, input.avaliacaoId), eq(repAvaliacoes.unitId, input.unitId)));

      await recalcularResumo(db, input.unitId);
      return { success: true };
    }),

  // ── Gerar resposta com IA ─────────────────────────────────────────────────
  gerarRespostaIA: protectedProcedure
    .input(z.object({
      avaliacaoId: z.number(),
      unitId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [avaliacao] = await db.select().from(repAvaliacoes)
        .where(and(eq(repAvaliacoes.id, input.avaliacaoId), eq(repAvaliacoes.unitId, input.unitId)));

      if (!avaliacao) throw new TRPCError({ code: "NOT_FOUND" });

      const [config] = await db.select().from(repConfigIA).where(eq(repConfigIA.unitId, input.unitId));

      const nomeEstab = config?.nomeEstabelecimento || "Barbearia VIP";
      const nomeProprietario = config?.nomeProprietario || "Equipe";
      const tom = config?.tom || "amigavel";
      const promptPersonalizado = config?.promptPersonalizado;

      const tomDesc = tom === "formal" ? "formal e profissional" : tom === "casual" ? "casual e descontraído" : "amigável e acolhedor";
      const nota = parseFloat(String(avaliacao.nota));
      const sentimento = nota >= 4 ? "positiva" : nota <= 2 ? "negativa" : "neutra";

      const systemPrompt = promptPersonalizado ||
        `Você é o gerente de reputação da ${nomeEstab}. Responda avaliações de clientes de forma ${tomDesc}. 
         Seja genuíno, personalizado e nunca use respostas genéricas. 
         ${config?.incluirAssinatura ? `Assine como: ${nomeProprietario} — ${nomeEstab}` : ""}
         Responda SEMPRE em português brasileiro. Máximo 150 palavras.`;

      const userPrompt = `Avaliação ${sentimento} (${nota}/5 estrelas) de ${avaliacao.autorNome || "Cliente"} na plataforma ${avaliacao.plataforma.toUpperCase()}:
${avaliacao.titulo ? `Título: "${avaliacao.titulo}"` : ""}
${avaliacao.comentario ? `Comentário: "${avaliacao.comentario}"` : "(sem comentário)"}

Gere uma resposta personalizada e única para esta avaliação.`;

      const llmResponse = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const rawContent = llmResponse?.choices?.[0]?.message?.content;
      const textoGerado: string = typeof rawContent === "string" ? rawContent : Array.isArray(rawContent) ? rawContent.map((c: any) => c.text || "").join("") : "";

      // Salvar no histórico
      await db.insert(repRespostasIA).values({
        avaliacaoId: input.avaliacaoId,
        unitId: input.unitId,
        textoGerado,
        tom,
        usouIA: true,
      });

      return { resposta: textoGerado };
    }),

  // ── Importar avaliações do Google Places API ──────────────────────────────
  importarGooglePlaces: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      placeId: z.string(),
      apiKey: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await fetchGooglePlaceDetails(input.placeId, input.apiKey);
      if (!result.success || !result.data) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Erro ao buscar dados do Google" });
      }

      const place = result.data;
      const reviews = place.reviews || [];
      let importadas = 0, atualizadas = 0, ignoradas = 0;

      for (const review of reviews) {
        const externalId = `google-${input.placeId}-${review.time}`;
        const nota = review.rating;
        const sentimento = determineSentimento(nota);

        const existing = await db.select({ id: repAvaliacoes.id, comentario: repAvaliacoes.comentario, nota: repAvaliacoes.nota })
          .from(repAvaliacoes)
          .where(and(eq(repAvaliacoes.unitId, input.unitId), eq(repAvaliacoes.externalId, externalId)))
          .limit(1);

        const avalData = {
          unitId: input.unitId,
          plataforma: "google" as const,
          externalId,
          autorNome: review.author_name,
          autorFoto: review.profile_photo_url,
          nota: String(nota),
          comentario: review.text || "",
          sentimento,
          dataAvaliacao: new Date(review.time * 1000),
          urlAvaliacao: review.author_url,
          isVerificado: true,
        };

        if (existing.length > 0) {
          const e = existing[0];
          if (e.comentario !== review.text || String(e.nota) !== String(nota)) {
            await db.update(repAvaliacoes).set(avalData).where(eq(repAvaliacoes.id, e.id));
            atualizadas++;
          } else {
            ignoradas++;
          }
        } else {
          await db.insert(repAvaliacoes).values(avalData);
          importadas++;
        }
      }

      // Salvar/atualizar conexão
      const conexaoExisting = await db.select({ id: repConexoes.id })
        .from(repConexoes)
        .where(and(eq(repConexoes.unitId, input.unitId), eq(repConexoes.plataforma, "google")))
        .limit(1);

      const conexaoData = {
        unitId: input.unitId,
        plataforma: "google" as const,
        externalId: input.placeId,
        googlePlaceId: input.placeId,
        googleApiKey: input.apiKey,
        nome: place.name,
        url: place.url,
        totalAvaliacoes: place.user_ratings_total || reviews.length,
        notaMedia: String(place.rating || 0),
        ultimaSincronizacao: new Date(),
      };

      if (conexaoExisting.length > 0) {
        await db.update(repConexoes).set(conexaoData).where(eq(repConexoes.id, conexaoExisting[0].id));
      } else {
        await db.insert(repConexoes).values(conexaoData);
      }

      await recalcularResumo(db, input.unitId);

      return {
        success: true,
        importadas,
        atualizadas,
        ignoradas,
        nomeLugar: place.name,
        notaGoogle: place.rating,
        totalGoogle: place.user_ratings_total,
      };
    }),

  // ── Conexões configuradas ─────────────────────────────────────────────────
  getConexoes: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(repConexoes).where(eq(repConexoes.unitId, input.unitId));
    }),

  saveConexao: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      plataforma: z.enum(["google", "ifood", "tripadvisor", "ubereats", "rappi", "facebook", "instagram", "manual"]),
      externalId: z.string(),
      nome: z.string().optional(),
      url: z.string().optional(),
      googlePlaceId: z.string().optional(),
      googleApiKey: z.string().optional(),
      googleClientId: z.string().optional(),
      googleClientSecret: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db.select({ id: repConexoes.id })
        .from(repConexoes)
        .where(and(eq(repConexoes.unitId, input.unitId), eq(repConexoes.plataforma, input.plataforma)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(repConexoes).set(input).where(eq(repConexoes.id, existing[0].id));
      } else {
        await db.insert(repConexoes).values(input);
      }
      return { success: true };
    }),

  deleteConexao: protectedProcedure
    .input(z.object({ id: z.number(), unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(repConexoes).where(and(eq(repConexoes.id, input.id), eq(repConexoes.unitId, input.unitId)));
      return { success: true };
    }),

  // ── Configuração de IA ────────────────────────────────────────────────────
  getConfigIA: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [config] = await db.select().from(repConfigIA).where(eq(repConfigIA.unitId, input.unitId));
      return config || null;
    }),

  saveConfigIA: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      nomeEstabelecimento: z.string().optional(),
      nomeProprietario: z.string().optional(),
      tom: z.enum(["formal", "casual", "amigavel"]).optional(),
      incluirAssinatura: z.boolean().optional(),
      autoResponder: z.boolean().optional(),
      autoResponderPositivas: z.boolean().optional(),
      autoResponderNegativas: z.boolean().optional(),
      promptPersonalizado: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { unitId, ...data } = input;
      await db.insert(repConfigIA).values({ unitId, ...data })
        .onDuplicateKeyUpdate({ set: data });
      return { success: true };
    }),

  // ── Análise de sentimento por período ────────────────────────────────────
  getAnalise: protectedProcedure
    .input(z.object({
      unitId: z.number(),
      periodo: z.enum(["7d", "30d", "90d", "12m"]).default("30d"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const dias = input.periodo === "7d" ? 7 : input.periodo === "30d" ? 30 : input.periodo === "90d" ? 90 : 365;
      const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

      const [evolucao, porPlataforma, porNota] = await Promise.all([
        db.execute(sql`
          SELECT 
            DATE_FORMAT(dataAvaliacao, '%Y-%m-%d') as data,
            COUNT(*) as total,
            AVG(CAST(nota AS DECIMAL(3,1))) as media,
            SUM(CASE WHEN sentimento = 'positivo' THEN 1 ELSE 0 END) as positivas,
            SUM(CASE WHEN sentimento = 'negativo' THEN 1 ELSE 0 END) as negativas
          FROM rep_avaliacoes
          WHERE unitId = ${input.unitId} AND dataAvaliacao >= ${desde}
          GROUP BY data ORDER BY data ASC
        `),
        db.execute(sql`
          SELECT plataforma, COUNT(*) as total, AVG(CAST(nota AS DECIMAL(3,1))) as media
          FROM rep_avaliacoes
          WHERE unitId = ${input.unitId} AND dataAvaliacao >= ${desde}
          GROUP BY plataforma
        `),
        db.execute(sql`
          SELECT ROUND(nota) as nota, COUNT(*) as total
          FROM rep_avaliacoes
          WHERE unitId = ${input.unitId} AND dataAvaliacao >= ${desde}
          GROUP BY ROUND(nota) ORDER BY nota DESC
        `),
      ]);

      return {
        evolucao: (evolucao[0] as unknown as any[]) || [],
        porPlataforma: (porPlataforma[0] as unknown as any[]) || [],
        porNota: (porNota[0] as unknown as any[]) || [],
      };
    }),

  // ── Sincronizar todas as conexões ativas ──────────────────────────────────
  sincronizar: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conexoes = await db.select().from(repConexoes)
        .where(and(eq(repConexoes.unitId, input.unitId), eq(repConexoes.isAtivo, true)));

      let totalImportadas = 0;
      const resultados: any[] = [];

      for (const conexao of conexoes) {
        if (conexao.plataforma === "google" && conexao.googlePlaceId && conexao.googleApiKey) {
          const result = await fetchGooglePlaceDetails(conexao.googlePlaceId, conexao.googleApiKey);
          if (result.success && result.data) {
            const reviews = result.data.reviews || [];
            let importadas = 0;
            for (const review of reviews) {
              const externalId = `google-${conexao.googlePlaceId}-${review.time}`;
              const existing = await db.select({ id: repAvaliacoes.id })
                .from(repAvaliacoes)
                .where(and(eq(repAvaliacoes.unitId, input.unitId), eq(repAvaliacoes.externalId, externalId)))
                .limit(1);
              if (existing.length === 0) {
                await db.insert(repAvaliacoes).values({
                  unitId: input.unitId,
                  plataforma: "google",
                  externalId,
                  autorNome: review.author_name,
                  autorFoto: review.profile_photo_url,
                  nota: String(review.rating),
                  comentario: review.text || "",
                  sentimento: determineSentimento(review.rating),
                  dataAvaliacao: new Date(review.time * 1000),
                  isVerificado: true,
                });
                importadas++;
                totalImportadas++;
              }
            }
            await db.update(repConexoes).set({ ultimaSincronizacao: new Date() }).where(eq(repConexoes.id, conexao.id));
            resultados.push({ plataforma: "google", nome: conexao.nome, importadas });
          }
        }
      }

      if (totalImportadas > 0) await recalcularResumo(db, input.unitId);

      return { success: true, totalImportadas, resultados };
    }),

  // ── Excluir avaliação ─────────────────────────────────────────────────────
  deleteAvaliacao: protectedProcedure
    .input(z.object({ id: z.number(), unitId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(repAvaliacoes).where(and(eq(repAvaliacoes.id, input.id), eq(repAvaliacoes.unitId, input.unitId)));
      await recalcularResumo(db, input.unitId);
      return { success: true };
    }),

  // ── Resumo para o Dashboard Central ──────────────────────────────────────
  getResumo: protectedProcedure
    .input(z.object({ unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [resumo] = await db.select().from(repResumo).where(eq(repResumo.unitId, input.unitId));
      return resumo || null;
    }),
});
