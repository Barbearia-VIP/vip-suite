/**
 * gestaoTotal.ts — Router tRPC do módulo Gestão Total
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  gtTarefas, gtProcessos, gtInstrucoes, gtIndicadores, gtPlanejamento,
  gtReunioes, gtCargos, gtColaboradores, gtFinanceiro, gtFornecedores,
  gtCompras, gtProblemas, gtOportunidades, gtRiscos, gtDocumentos,
  gtMarketing, gtAdvisorConversations, gtAuditLog,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

// ── Helper de auditoria ───────────────────────────────────────────────────────
async function logAudit(
  orgId: number, unitId: number | null | undefined,
  userId: number, userName: string,
  acao: string, entidade: string, entidadeId: number, descricao: string
) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(gtAuditLog).values({ orgId, unitId, userId, userName, acao, entidade, entidadeId, descricao });
  } catch { /* não bloquear por falha de auditoria */ }
}

// ── Tarefas ───────────────────────────────────────────────────────────────────
const tarefasRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtTarefas.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtTarefas.unitId, input.unitId));
      if (input.status) conds.push(eq(gtTarefas.status, input.status as "pendente" | "em_andamento" | "em_revisao" | "concluida"));
      return db.select().from(gtTarefas).where(and(...conds)).orderBy(gtTarefas.ordem, desc(gtTarefas.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      orgId: z.number(), unitId: z.number().optional(),
      titulo: z.string().min(1), descricao: z.string().optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
      responsavel: z.string().optional(), prazo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(gtTarefas).values({
        orgId: input.orgId, unitId: input.unitId,
        titulo: input.titulo, descricao: input.descricao,
        prioridade: input.prioridade, responsavel: input.responsavel,
        prazo: input.prazo ? new Date(input.prazo) : undefined,
        createdBy: ctx.user!.id,
      });
      const insertId = (result as { insertId: number }).insertId;
      await logAudit(input.orgId, input.unitId, ctx.user!.id, ctx.user!.name ?? "", "created", "tarefa", insertId, `Tarefa criada: ${input.titulo}`);
      return { id: insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(), orgId: z.number(),
      titulo: z.string().optional(), descricao: z.string().optional(),
      status: z.enum(["pendente", "em_andamento", "em_revisao", "concluida"]).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      responsavel: z.string().optional(), prazo: z.string().optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, orgId, prazo, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (prazo) updateData.prazo = new Date(prazo);
      if (rest.status === "concluida") updateData.concluidaEm = new Date();
      await db.update(gtTarefas).set(updateData).where(and(eq(gtTarefas.id, id), eq(gtTarefas.orgId, orgId)));
      await logAudit(orgId, undefined, ctx.user!.id, ctx.user!.name ?? "", "updated", "tarefa", id, `Tarefa atualizada`);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtTarefas).where(and(eq(gtTarefas.id, input.id), eq(gtTarefas.orgId, input.orgId)));
      await logAudit(input.orgId, undefined, ctx.user!.id, ctx.user!.name ?? "", "deleted", "tarefa", input.id, `Tarefa removida`);
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number(), status: z.enum(["pendente", "em_andamento", "em_revisao", "concluida"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === "concluida") updateData.concluidaEm = new Date();
      await db.update(gtTarefas).set(updateData).where(and(eq(gtTarefas.id, input.id), eq(gtTarefas.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Processos ─────────────────────────────────────────────────────────────────
const processosRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtProcessos.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtProcessos.unitId, input.unitId));
      return db.select().from(gtProcessos).where(and(...conds)).orderBy(desc(gtProcessos.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      nome: z.string().min(1), descricao: z.string().optional(),
      categoria: z.string().optional(), responsavel: z.string().optional(),
      etapas: z.array(z.object({ titulo: z.string(), descricao: z.string().optional(), responsavel: z.string().optional(), concluida: z.boolean().default(false) })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      if (id) {
        await db.update(gtProcessos).set(data).where(and(eq(gtProcessos.id, id), eq(gtProcessos.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtProcessos).values(data);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtProcessos).where(and(eq(gtProcessos.id, input.id), eq(gtProcessos.orgId, input.orgId)));
      return { success: true };
    }),

  generateAI: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      nomeUnidade: z.string(),
      segmento: z.string().optional(),
      missao: z.string().optional(),
      visao: z.string().optional(),
      objetivos: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = `Você é um especialista em gestão de processos para empresas brasileiras.
Gere processos operacionais completos e práticos. Responda APENAS com JSON válido, sem markdown.`;

      const userPrompt = `Gere os processos operacionais para:
- Empresa: ${input.nomeUnidade}
- Segmento: ${input.segmento ?? "Barbearia/Salão"}
- Missão: ${input.missao ?? "Não informada"}
- Visão: ${input.visao ?? "Não informada"}
- Objetivos estratégicos: ${(input.objetivos ?? []).join("; ")}

Retorne JSON com esta estrutura:
{
  "processos": [
    {
      "nome": "string",
      "tipo": "principal" | "apoio",
      "area": "string (ex: Atendimento, Financeiro, RH, Marketing)",
      "descricao": "string (2-3 frases)",
      "categoria": "string",
      "duracaoEstimada": "string (ex: 30 min, 2 horas)",
      "etapas": [
        { "titulo": "string", "descricao": "string", "responsavel": "string", "concluida": false }
      ],
      "recursos": ["string"],
      "metricas": ["string"],
      "riscos": ["string"]
    }
  ]
}
Gere 4-6 processos principais e 2-4 de apoio. Cada processo deve ter 3-6 etapas. Seja específico e prático para o segmento.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent3 = response.choices?.[0]?.message?.content;
      const content = typeof rawContent3 === "string" ? rawContent3 : "{}";
      try {
        const parsed = JSON.parse(content);
        return { success: true, data: parsed };
      } catch {
        return { success: false, data: null, error: "Falha ao interpretar resposta da IA" };
      }
    }),

  saveMany: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      processos: z.array(z.object({
        nome: z.string(), tipo: z.enum(["principal", "apoio"]).default("principal"),
        area: z.string().optional(), descricao: z.string().optional(),
        categoria: z.string().optional(), duracaoEstimada: z.string().optional(),
        etapas: z.array(z.object({ titulo: z.string(), descricao: z.string().optional(), responsavel: z.string().optional(), concluida: z.boolean().default(false) })).optional(),
        recursos: z.array(z.string()).optional(),
        metricas: z.array(z.string()).optional(),
        riscos: z.array(z.string()).optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const ids: number[] = [];
      for (const p of input.processos) {
        const [r] = await db.insert(gtProcessos).values({
          orgId: input.orgId, unitId: input.unitId,
          nome: p.nome, tipo: p.tipo, area: p.area, descricao: p.descricao,
          categoria: p.categoria, duracaoEstimada: p.duracaoEstimada,
          etapas: p.etapas, recursos: p.recursos, metricas: p.metricas,
          riscos: p.riscos, geradoPorIA: 1, status: "ativo",
        });
        ids.push((r as { insertId: number }).insertId);
      }
      return { ids };
    }),
});

// ── Instruções de Trabalho ────────────────────────────────────────────────────
const instrucoesRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), categoria: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtInstrucoes.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtInstrucoes.unitId, input.unitId));
      if (input.categoria) conds.push(eq(gtInstrucoes.categoria, input.categoria));
      return db.select().from(gtInstrucoes).where(and(...conds)).orderBy(desc(gtInstrucoes.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      titulo: z.string().min(1), conteudo: z.string().optional(),
      categoria: z.string().optional(), versao: z.string().optional(),
      responsavelNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      if (id) {
        await db.update(gtInstrucoes).set(data).where(and(eq(gtInstrucoes.id, id), eq(gtInstrucoes.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtInstrucoes).values(data);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtInstrucoes).where(and(eq(gtInstrucoes.id, input.id), eq(gtInstrucoes.orgId, input.orgId)));
      return { success: true };
    }),

  generateFromProcesso: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      processoId: z.number(),
      processoNome: z.string(),
      processoDescricao: z.string().optional(),
      etapas: z.array(z.object({ titulo: z.string(), descricao: z.string().optional(), responsavel: z.string().optional() })).optional(),
      segmento: z.string().optional(),
      responsavelNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = `Você é um especialista em instruções de trabalho para empresas brasileiras.
Gere uma instrução de trabalho detalhada e prática. Responda APENAS com JSON válido, sem markdown.`;

      const etapasStr = (input.etapas ?? []).map((e, i) => `${i+1}. ${e.titulo}${e.descricao ? ": " + e.descricao : ""}`).join("\n");

      const userPrompt = `Gere uma instrução de trabalho detalhada para o processo:
- Processo: ${input.processoNome}
- Descrição: ${input.processoDescricao ?? "Não informada"}
- Segmento: ${input.segmento ?? "Barbearia/Salão"}
- Etapas do processo: ${etapasStr || "Não informadas"}
- Responsável: ${input.responsavelNome ?? "A definir"}

Retorne JSON com esta estrutura:
{
  "titulo": "string (nome da instrução)",
  "categoria": "string",
  "conteudo": "string (texto completo da instrução, em markdown)",
  "plano": {
    "objetivo": "string",
    "publicoAlvo": "string",
    "frequencia": "string (ex: Diário, Semanal, Por demanda)",
    "tempoEstimado": "string",
    "materiais": ["string"],
    "passos": [
      {
        "numero": 1,
        "titulo": "string",
        "descricao": "string",
        "dicas": ["string"],
        "alertas": ["string"]
      }
    ],
    "indicadoresSucesso": ["string"],
    "errosComuns": ["string"]
  }
}
Seja detalhado, prático e específico. O conteúdo deve ser suficiente para um novo colaborador executar o processo sem supervisao.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : "{}";
      try {
        const parsed = JSON.parse(content);
        // Salvar automaticamente no banco
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const [r] = await db.insert(gtInstrucoes).values({
          orgId: input.orgId, unitId: input.unitId,
          processoId: input.processoId,
          titulo: parsed.titulo ?? `IT - ${input.processoNome}`,
          conteudo: parsed.conteudo,
          plano: parsed.plano,
          categoria: parsed.categoria,
          responsavelNome: input.responsavelNome,
          geradoPorIA: 1, status: "pendente",
        });
        const id = (r as { insertId: number }).insertId;
        return { success: true, id, data: parsed };
      } catch {
        return { success: false, id: null, data: null, error: "Falha ao interpretar resposta da IA" };
      }
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(), orgId: z.number(),
      status: z.enum(["pendente", "em_andamento", "concluida", "pausada"]),
      responsavelId: z.number().optional(),
      responsavelNome: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, orgId, ...data } = input;
      await db.update(gtInstrucoes).set(data).where(and(eq(gtInstrucoes.id, id), eq(gtInstrucoes.orgId, orgId)));
      return { success: true };
    }),
});

// ── Indicadores ───────────────────────────────────────────────────────────────
const indicadoresGtRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), periodo: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtIndicadores.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtIndicadores.unitId, input.unitId));
      if (input.periodo) conds.push(eq(gtIndicadores.periodo, input.periodo));
      return db.select().from(gtIndicadores).where(and(...conds)).orderBy(gtIndicadores.nome);
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      nome: z.string().min(1), descricao: z.string().optional(),
      tipo: z.enum(["numero", "percentual", "moeda", "tempo"]).default("numero"),
      valorAtual: z.number().optional(), meta: z.number().optional(),
      periodo: z.string().optional(), tendencia: z.enum(["subindo", "estavel", "caindo"]).optional(),
      cor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, valorAtual, meta, ...rest } = input;
      const dbData = { ...rest, valorAtual: valorAtual?.toString(), meta: meta?.toString() };
      if (id) {
        await db.update(gtIndicadores).set(dbData).where(and(eq(gtIndicadores.id, id), eq(gtIndicadores.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtIndicadores).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtIndicadores).where(and(eq(gtIndicadores.id, input.id), eq(gtIndicadores.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Planejamento Estratégico ──────────────────────────────────────────────────
const planejamentoRouter = router({
  get: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), ano: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const conds = [eq(gtPlanejamento.orgId, input.orgId), eq(gtPlanejamento.ano, input.ano)];
      if (input.unitId) conds.push(eq(gtPlanejamento.unitId, input.unitId));
      const rows = await db.select().from(gtPlanejamento).where(and(...conds)).limit(1);
      return rows[0] ?? null;
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(), ano: z.number(),
      missao: z.string().optional(), visao: z.string().optional(), valores: z.string().optional(),
      swotForcas: z.array(z.string()).optional(), swotFraquezas: z.array(z.string()).optional(),
      swotOportunidades: z.array(z.string()).optional(), swotAmeacas: z.array(z.string()).optional(),
      objetivos: z.array(z.object({ titulo: z.string(), prazo: z.string().optional(), responsavel: z.string().optional(), status: z.string().optional() })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      if (id) {
        await db.update(gtPlanejamento).set(data).where(and(eq(gtPlanejamento.id, id), eq(gtPlanejamento.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtPlanejamento).values(data);
      return { id: (r as { insertId: number }).insertId };
    }),

  generateAI: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      nomeUnidade: z.string(),
      segmento: z.string().optional(),
      cidade: z.string().optional(),
      porte: z.string().optional(),
      descricaoNegocio: z.string().optional(),
      diferenciais: z.string().optional(),
      desafios: z.string().optional(),
      ano: z.number(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = `Você é um especialista em planejamento estratégico para pequenas e médias empresas brasileiras.
Gere um planejamento estratégico completo, prático e personalizado. Responda APENAS com JSON válido, sem markdown.`;

      const userPrompt = `Gere um planejamento estratégico para:
- Empresa: ${input.nomeUnidade}
- Segmento: ${input.segmento ?? "Barbearia/Salão"}
- Cidade: ${input.cidade ?? "Brasil"}
- Porte: ${input.porte ?? "Pequena empresa"}
- Descrição: ${input.descricaoNegocio ?? "Barbearia premium"}
- Diferenciais: ${input.diferenciais ?? "Atendimento personalizado"}
- Desafios atuais: ${input.desafios ?? "Atrair e reter clientes"}
- Ano: ${input.ano}

Retorne JSON com esta estrutura:
{
  "missao": "string (2-3 frases sobre o propósito da empresa)",
  "visao": "string (onde quer chegar em 3-5 anos)",
  "valores": "string (4-6 valores separados por vírgula)",
  "swotForcas": ["string", ...],
  "swotFraquezas": ["string", ...],
  "swotOportunidades": ["string", ...],
  "swotAmeacas": ["string", ...],
  "objetivos": [
    { "titulo": "string", "prazo": "string (ex: Q2 2026)", "status": "pendente" }
  ]
}
Cada array SWOT deve ter 4-5 itens. Objetivos devem ter 4-6 itens. Seja específico para o segmento.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

       const rawContent2 = response.choices?.[0]?.message?.content;
      const content = typeof rawContent2 === "string" ? rawContent2 : "{}";
      try {
        const parsed = JSON.parse(content);
        return { success: true, data: parsed };
      } catch {
        return { success: false, data: null, error: "Falha ao interpretar resposta da IA" };
      }
    }),
});
// ── Reuniões ──────────────────────────────────────────────────────────────────
const reunioesRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtReunioes.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtReunioes.unitId, input.unitId));
      if (input.status) conds.push(eq(gtReunioes.status, input.status as "agendada" | "realizada" | "cancelada"));
      return db.select().from(gtReunioes).where(and(...conds)).orderBy(desc(gtReunioes.data));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      titulo: z.string().min(1), data: z.string(), duracao: z.number().optional(),
      local: z.string().optional(), pauta: z.string().optional(), ata: z.string().optional(),
      participantes: z.array(z.string()).optional(),
      status: z.enum(["agendada", "realizada", "cancelada"]).default("agendada"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, data: dataStr, ...rest } = input;
      const dbData = { ...rest, data: new Date(dataStr) };
      if (id) {
        await db.update(gtReunioes).set(dbData).where(and(eq(gtReunioes.id, id), eq(gtReunioes.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtReunioes).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtReunioes).where(and(eq(gtReunioes.id, input.id), eq(gtReunioes.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Cargos ────────────────────────────────────────────────────────────────────
const cargosRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(gtCargos).where(eq(gtCargos.orgId, input.orgId)).orderBy(gtCargos.nome);
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(),
      nome: z.string().min(1), descricao: z.string().optional(),
      nivel: z.enum(["operacional", "tatico", "estrategico"]).default("operacional"),
      salarioBase: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, salarioBase, ...rest } = input;
      const dbData = { ...rest, salarioBase: salarioBase?.toString() };
      if (id) {
        await db.update(gtCargos).set(dbData).where(and(eq(gtCargos.id, id), eq(gtCargos.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtCargos).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtCargos).where(and(eq(gtCargos.id, input.id), eq(gtCargos.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Colaboradores GT ──────────────────────────────────────────────────────────
const colaboradoresGtRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtColaboradores.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtColaboradores.unitId, input.unitId));
      if (input.status) conds.push(eq(gtColaboradores.status, input.status as "ativo" | "ferias" | "afastado" | "desligado"));
      return db.select().from(gtColaboradores).where(and(...conds)).orderBy(gtColaboradores.nome);
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      nome: z.string().min(1), email: z.string().optional(), telefone: z.string().optional(),
      cargoId: z.number().optional(), salario: z.number().optional(),
      dataAdmissao: z.string().optional(),
      status: z.enum(["ativo", "ferias", "afastado", "desligado"]).default("ativo"),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, salario, dataAdmissao, ...rest } = input;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbData: any = { ...rest, salario: salario?.toString() };
      if (dataAdmissao) dbData.dataAdmissao = new Date(dataAdmissao);
      if (id) {
        await db.update(gtColaboradores).set(dbData).where(and(eq(gtColaboradores.id, id), eq(gtColaboradores.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtColaboradores).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtColaboradores).where(and(eq(gtColaboradores.id, input.id), eq(gtColaboradores.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Financeiro GT ─────────────────────────────────────────────────────────────
const financeiroGtRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), referencia: z.string().optional(), tipo: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtFinanceiro.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtFinanceiro.unitId, input.unitId));
      if (input.referencia) conds.push(eq(gtFinanceiro.referencia, input.referencia));
      if (input.tipo) conds.push(eq(gtFinanceiro.tipo, input.tipo as "receita" | "despesa"));
      return db.select().from(gtFinanceiro).where(and(...conds)).orderBy(desc(gtFinanceiro.createdAt));
    }),

  dre: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), referencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { receitas: 0, despesas: 0, lucro: 0, margem: 0, itens: [] };
      const conds = [eq(gtFinanceiro.orgId, input.orgId), eq(gtFinanceiro.referencia, input.referencia)];
      if (input.unitId) conds.push(eq(gtFinanceiro.unitId, input.unitId));
      const rows = await db.select().from(gtFinanceiro).where(and(...conds));
      const receitas = rows.filter(r => r.tipo === "receita").reduce((s, r) => s + Number(r.valor), 0);
      const despesas = rows.filter(r => r.tipo === "despesa").reduce((s, r) => s + Number(r.valor), 0);
      const lucro = receitas - despesas;
      const margem = receitas > 0 ? (lucro / receitas) * 100 : 0;
      return { receitas, despesas, lucro, margem, itens: rows };
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      tipo: z.enum(["receita", "despesa"]), categoria: z.string().optional(),
      descricao: z.string().min(1), valor: z.number().positive(),
      vencimento: z.string().optional(), pago: z.boolean().default(false),
      formaPagamento: z.string().optional(), referencia: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, valor, vencimento, pago, ...rest } = input;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbData: any = { ...rest, valor: valor.toString(), pago: pago ? 1 : 0 };
      if (vencimento) dbData.vencimento = new Date(vencimento);
      if (id) {
        await db.update(gtFinanceiro).set(dbData).where(and(eq(gtFinanceiro.id, id), eq(gtFinanceiro.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtFinanceiro).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtFinanceiro).where(and(eq(gtFinanceiro.id, input.id), eq(gtFinanceiro.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Fornecedores ──────────────────────────────────────────────────────────────
const fornecedoresRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(gtFornecedores).where(eq(gtFornecedores.orgId, input.orgId)).orderBy(gtFornecedores.nome);
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(),
      nome: z.string().min(1), cnpj: z.string().optional(),
      email: z.string().optional(), telefone: z.string().optional(),
      categoria: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      if (id) {
        await db.update(gtFornecedores).set(data).where(and(eq(gtFornecedores.id, id), eq(gtFornecedores.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtFornecedores).values(data);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtFornecedores).where(and(eq(gtFornecedores.id, input.id), eq(gtFornecedores.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Compras ───────────────────────────────────────────────────────────────────
const comprasRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtCompras.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtCompras.unitId, input.unitId));
      if (input.status) conds.push(eq(gtCompras.status, input.status as "rascunho" | "aguardando_aprovacao" | "aprovado" | "recebido" | "cancelado"));
      return db.select().from(gtCompras).where(and(...conds)).orderBy(desc(gtCompras.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      fornecedorId: z.number().optional(), fornecedorNome: z.string().optional(),
      status: z.enum(["rascunho", "aguardando_aprovacao", "aprovado", "recebido", "cancelado"]).default("rascunho"),
      itens: z.array(z.object({ descricao: z.string(), qtd: z.number(), valorUnit: z.number(), total: z.number() })).optional(),
      total: z.number().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, total, ...rest } = input;
      const dbData = { ...rest, total: total?.toString() };
      if (id) {
        await db.update(gtCompras).set(dbData).where(and(eq(gtCompras.id, id), eq(gtCompras.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtCompras).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  aprovar: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(gtCompras).set({ status: "aprovado", aprovadoPor: ctx.user!.name ?? "", aprovadoEm: new Date() })
        .where(and(eq(gtCompras.id, input.id), eq(gtCompras.orgId, input.orgId)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtCompras).where(and(eq(gtCompras.id, input.id), eq(gtCompras.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Problemas ─────────────────────────────────────────────────────────────────
const problemasRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtProblemas.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtProblemas.unitId, input.unitId));
      if (input.status) conds.push(eq(gtProblemas.status, input.status as "aberto" | "em_analise" | "resolvido" | "fechado"));
      return db.select().from(gtProblemas).where(and(...conds)).orderBy(desc(gtProblemas.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      titulo: z.string().min(1), descricao: z.string().optional(),
      severidade: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
      status: z.enum(["aberto", "em_analise", "resolvido", "fechado"]).default("aberto"),
      responsavel: z.string().optional(), resolucao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbData: any = { ...data };
      if (data.status === "resolvido") dbData.resolvidoEm = new Date();
      if (id) {
        await db.update(gtProblemas).set(dbData).where(and(eq(gtProblemas.id, id), eq(gtProblemas.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtProblemas).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtProblemas).where(and(eq(gtProblemas.id, input.id), eq(gtProblemas.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Oportunidades ─────────────────────────────────────────────────────────────
const oportunidadesRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtOportunidades.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtOportunidades.unitId, input.unitId));
      if (input.status) conds.push(eq(gtOportunidades.status, input.status as "identificada" | "em_avaliacao" | "aprovada" | "implementando" | "concluida" | "descartada"));
      return db.select().from(gtOportunidades).where(and(...conds)).orderBy(desc(gtOportunidades.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      titulo: z.string().min(1), descricao: z.string().optional(),
      prioridade: z.enum(["baixa", "media", "alta"]).default("media"),
      status: z.enum(["identificada", "em_avaliacao", "aprovada", "implementando", "concluida", "descartada"]).default("identificada"),
      valorEstimado: z.number().optional(), responsavel: z.string().optional(), prazo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, valorEstimado, prazo, ...rest } = input;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbData: any = { ...rest, valorEstimado: valorEstimado?.toString() };
      if (prazo) dbData.prazo = new Date(prazo);
      if (id) {
        await db.update(gtOportunidades).set(dbData).where(and(eq(gtOportunidades.id, id), eq(gtOportunidades.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtOportunidades).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtOportunidades).where(and(eq(gtOportunidades.id, input.id), eq(gtOportunidades.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Riscos ────────────────────────────────────────────────────────────────────
const riscosRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtRiscos.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtRiscos.unitId, input.unitId));
      return db.select().from(gtRiscos).where(and(...conds)).orderBy(desc(gtRiscos.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      titulo: z.string().min(1), descricao: z.string().optional(),
      probabilidade: z.enum(["baixa", "media", "alta"]).default("media"),
      impacto: z.enum(["baixo", "medio", "alto"]).default("medio"),
      status: z.enum(["identificado", "monitorando", "mitigado", "aceito"]).default("identificado"),
      mitigacao: z.string().optional(), responsavel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      if (id) {
        await db.update(gtRiscos).set(data).where(and(eq(gtRiscos.id, id), eq(gtRiscos.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtRiscos).values(data);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtRiscos).where(and(eq(gtRiscos.id, input.id), eq(gtRiscos.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Documentos ────────────────────────────────────────────────────────────────
const documentosRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), categoria: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtDocumentos.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtDocumentos.unitId, input.unitId));
      if (input.categoria) conds.push(eq(gtDocumentos.categoria, input.categoria));
      return db.select().from(gtDocumentos).where(and(...conds)).orderBy(desc(gtDocumentos.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      titulo: z.string().min(1), descricao: z.string().optional(),
      categoria: z.string().optional(), urlArquivo: z.string().optional(),
      nomeArquivo: z.string().optional(), versao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      const dbData = { ...data, createdBy: ctx.user!.id };
      if (id) {
        await db.update(gtDocumentos).set(dbData).where(and(eq(gtDocumentos.id, id), eq(gtDocumentos.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtDocumentos).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtDocumentos).where(and(eq(gtDocumentos.id, input.id), eq(gtDocumentos.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── Marketing ─────────────────────────────────────────────────────────────────
const marketingRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtMarketing.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtMarketing.unitId, input.unitId));
      if (input.status) conds.push(eq(gtMarketing.status, input.status as "planejamento" | "ativa" | "pausada" | "concluida"));
      return db.select().from(gtMarketing).where(and(...conds)).orderBy(desc(gtMarketing.createdAt));
    }),

  save: protectedProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      nome: z.string().min(1), descricao: z.string().optional(),
      canal: z.enum(["instagram", "facebook", "whatsapp", "email", "google", "offline", "outro"]).default("instagram"),
      status: z.enum(["planejamento", "ativa", "pausada", "concluida"]).default("planejamento"),
      budget: z.number().optional(), gasto: z.number().optional(),
      alcance: z.number().optional(), cliques: z.number().optional(), conversoes: z.number().optional(),
      dataInicio: z.string().optional(), dataFim: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, budget, gasto, dataInicio, dataFim, ...rest } = input;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbData: any = { ...rest, budget: budget?.toString(), gasto: gasto?.toString() };
      if (dataInicio) dbData.dataInicio = new Date(dataInicio);
      if (dataFim) dbData.dataFim = new Date(dataFim);
      if (id) {
        await db.update(gtMarketing).set(dbData).where(and(eq(gtMarketing.id, id), eq(gtMarketing.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtMarketing).values(dbData);
      return { id: (r as { insertId: number }).insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtMarketing).where(and(eq(gtMarketing.id, input.id), eq(gtMarketing.orgId, input.orgId)));
      return { success: true };
    }),
});

// ── IA Conselheiro ────────────────────────────────────────────────────────────
const iaRouter = router({
  listConversations: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtAdvisorConversations.orgId, input.orgId), eq(gtAdvisorConversations.userId, ctx.user!.id)];
      if (input.unitId) conds.push(eq(gtAdvisorConversations.unitId, input.unitId));
      return db.select().from(gtAdvisorConversations).where(and(...conds)).orderBy(desc(gtAdvisorConversations.updatedAt)).limit(20);
    }),

  getConversation: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(gtAdvisorConversations)
        .where(and(
          eq(gtAdvisorConversations.id, input.id),
          eq(gtAdvisorConversations.orgId, input.orgId),
          eq(gtAdvisorConversations.userId, ctx.user!.id)
        )).limit(1);
      return rows[0] ?? null;
    }),

  chat: protectedProcedure
    .input(z.object({
      orgId: z.number(), unitId: z.number().optional(),
      conversationId: z.number().optional(),
      message: z.string().min(1),
      context: z.object({
        tarefasPendentes: z.number().optional(),
        problemasAbertos: z.number().optional(),
        faturamentoMes: z.number().optional(),
        colaboradoresAtivos: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const systemPrompt = `Você é o IA Conselheiro da Barbearia VIP, um assistente especializado em gestão de barbearias e franquias.
Contexto atual da unidade:
- Tarefas pendentes: ${input.context?.tarefasPendentes ?? "N/A"}
- Problemas abertos: ${input.context?.problemasAbertos ?? "N/A"}
- Faturamento do mês: R$ ${input.context?.faturamentoMes?.toLocaleString("pt-BR") ?? "N/A"}
- Colaboradores ativos: ${input.context?.colaboradoresAtivos ?? "N/A"}

Responda de forma objetiva, prática e focada em resultados para o negócio.`;

      type ChatMessage = { role: string; content: string; timestamp: string };
      let messages: ChatMessage[] = [];
      let convId = input.conversationId;

      if (convId) {
        const rows = await db.select().from(gtAdvisorConversations)
          .where(and(eq(gtAdvisorConversations.id, convId), eq(gtAdvisorConversations.orgId, input.orgId)))
          .limit(1);
        if (rows[0]) messages = (rows[0].messages as ChatMessage[]) ?? [];
      }

      messages.push({ role: "user", content: input.message, timestamp: new Date().toISOString() });

      const llmMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.slice(-10).map((m: ChatMessage) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const response = await invokeLLM({ messages: llmMessages });
      const assistantContent = (response as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "Desculpe, não consegui processar sua solicitação.";

      messages.push({ role: "assistant", content: assistantContent, timestamp: new Date().toISOString() });

      const titulo = input.message.substring(0, 50) + (input.message.length > 50 ? "..." : "");
      if (convId) {
        await db.update(gtAdvisorConversations).set({ messages, updatedAt: new Date() })
          .where(eq(gtAdvisorConversations.id, convId));
      } else {
        const [r] = await db.insert(gtAdvisorConversations).values({
          orgId: input.orgId, unitId: input.unitId,
          userId: ctx.user!.id, messages, titulo,
        });
        convId = (r as { insertId: number }).insertId;
      }

      return { conversationId: convId, reply: assistantContent };
    }),

  deleteConversation: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtAdvisorConversations)
        .where(and(
          eq(gtAdvisorConversations.id, input.id),
          eq(gtAdvisorConversations.orgId, input.orgId),
          eq(gtAdvisorConversations.userId, ctx.user!.id)
        ));
      return { success: true };
    }),
});

// ── Auditoria ─────────────────────────────────────────────────────────────────
const auditoriaRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtAuditLog.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtAuditLog.unitId, input.unitId));
      return db.select().from(gtAuditLog).where(and(...conds)).orderBy(desc(gtAuditLog.createdAt)).limit(input.limit);
    }),
});

// ── Dashboard GT ──────────────────────────────────────────────────────────────
const dashboardGtRouter = router({
  kpis: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {
        tarefasPendentes: 0, tarefasAndamento: 0, tarefasConcluidas: 0,
        problemasAbertos: 0, reunioesHoje: 0, colaboradoresAtivos: 0,
        receitasMes: 0, despesasMes: 0, lucroMes: 0,
        comprasPendentes: 0, riscosAltos: 0, totalTarefas: 0, totalProblemas: 0,
      };

      const orgCond = input.unitId
        ? and(eq(gtTarefas.orgId, input.orgId), eq(gtTarefas.unitId, input.unitId))
        : eq(gtTarefas.orgId, input.orgId);

      const tarefas = await db.select().from(gtTarefas).where(orgCond);
      const tarefasPendentes = tarefas.filter(t => t.status === "pendente").length;
      const tarefasAndamento = tarefas.filter(t => t.status === "em_andamento").length;
      const tarefasConcluidas = tarefas.filter(t => t.status === "concluida").length;

      const probCond = input.unitId
        ? and(eq(gtProblemas.orgId, input.orgId), eq(gtProblemas.unitId, input.unitId))
        : eq(gtProblemas.orgId, input.orgId);
      const problemas = await db.select().from(gtProblemas).where(probCond);
      const problemasAbertos = problemas.filter(p => p.status === "aberto" || p.status === "em_analise").length;

      const hoje = new Date();
      const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const fimDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);
      const reunCond = input.unitId
        ? and(eq(gtReunioes.orgId, input.orgId), eq(gtReunioes.unitId, input.unitId))
        : eq(gtReunioes.orgId, input.orgId);
      const reunioes = await db.select().from(gtReunioes).where(reunCond);
      const reunioesHoje = reunioes.filter(r => r.data >= inicioDia && r.data <= fimDia).length;

      const colabCond = input.unitId
        ? and(eq(gtColaboradores.orgId, input.orgId), eq(gtColaboradores.unitId, input.unitId))
        : eq(gtColaboradores.orgId, input.orgId);
      const colaboradores = await db.select().from(gtColaboradores).where(colabCond);
      const colaboradoresAtivos = colaboradores.filter(c => c.status === "ativo").length;

      const refAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      const finCond = input.unitId
        ? and(eq(gtFinanceiro.orgId, input.orgId), eq(gtFinanceiro.unitId, input.unitId), eq(gtFinanceiro.referencia, refAtual))
        : and(eq(gtFinanceiro.orgId, input.orgId), eq(gtFinanceiro.referencia, refAtual));
      const financeiro = await db.select().from(gtFinanceiro).where(finCond);
      const receitasMes = financeiro.filter(f => f.tipo === "receita").reduce((s, f) => s + Number(f.valor), 0);
      const despesasMes = financeiro.filter(f => f.tipo === "despesa").reduce((s, f) => s + Number(f.valor), 0);

      const comprCond = input.unitId
        ? and(eq(gtCompras.orgId, input.orgId), eq(gtCompras.unitId, input.unitId), eq(gtCompras.status, "aguardando_aprovacao"))
        : and(eq(gtCompras.orgId, input.orgId), eq(gtCompras.status, "aguardando_aprovacao"));
      const comprasPendentes = await db.select().from(gtCompras).where(comprCond);

      const riscoCond = input.unitId
        ? and(eq(gtRiscos.orgId, input.orgId), eq(gtRiscos.unitId, input.unitId))
        : eq(gtRiscos.orgId, input.orgId);
      const riscos = await db.select().from(gtRiscos).where(riscoCond);
      const riscosAltos = riscos.filter(r => r.probabilidade === "alta" && r.impacto === "alto" && r.status !== "mitigado").length;

      return {
        tarefasPendentes, tarefasAndamento, tarefasConcluidas,
        problemasAbertos, reunioesHoje, colaboradoresAtivos,
        receitasMes, despesasMes, lucroMes: receitasMes - despesasMes,
        comprasPendentes: comprasPendentes.length,
        riscosAltos, totalTarefas: tarefas.length, totalProblemas: problemas.length,
      };
    }),

  tarefasRecentes: protectedProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), limit: z.number().default(5) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtTarefas.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtTarefas.unitId, input.unitId));
      return db.select().from(gtTarefas).where(and(...conds)).orderBy(desc(gtTarefas.updatedAt)).limit(input.limit);
    }),
});

// ── Router principal ──────────────────────────────────────────────────────────
export const gestaoTotalRouter = router({
  dashboard: dashboardGtRouter,
  tarefas: tarefasRouter,
  processos: processosRouter,
  instrucoes: instrucoesRouter,
  indicadores: indicadoresGtRouter,
  planejamento: planejamentoRouter,
  reunioes: reunioesRouter,
  cargos: cargosRouter,
  colaboradores: colaboradoresGtRouter,
  financeiro: financeiroGtRouter,
  fornecedores: fornecedoresRouter,
  compras: comprasRouter,
  problemas: problemasRouter,
  oportunidades: oportunidadesRouter,
  riscos: riscosRouter,
  documentos: documentosRouter,
  marketing: marketingRouter,
  ia: iaRouter,
  auditoria: auditoriaRouter,
});
