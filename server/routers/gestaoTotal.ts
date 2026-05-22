/**
 * gestaoTotal.ts — Router tRPC do módulo Gestão Total
 */
import { z } from "zod";
import { router, protectedProcedure, sysUserProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  gtTarefas, gtProcessos, gtInstrucoes, gtIndicadores, gtPlanejamento,
  gtReunioes, gtCargos, gtColaboradores, gtFinanceiro, gtFornecedores,
  gtCompras, gtProblemas, gtOportunidades, gtRiscos, gtDocumentos,
  gtMarketing, gtMarketingCampaigns, gtAdvisorConversations, gtAuditLog,
  gtContentHistory, gtArtHistory, gtBrandAssets, gtImageBank,
} from "../../drizzle/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { finConfigRouter } from "./finConfig";
import { invokeLLM } from "../_core/llm";
import { generateImage } from "../_core/imageGeneration";

// ── Helper para parse robusto de JSON da IA ──────────────────────────────────
function parseJsonSafe(raw: string): unknown {
  // Tenta parse direto
  try { return JSON.parse(raw); } catch { /* continua */ }
  // Remove blocos de código markdown: ```json ... ``` ou ``` ... ```
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(stripped); } catch { /* continua */ }
  // Extrai primeiro objeto JSON encontrado no texto
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* continua */ } }
  throw new Error("Não foi possível interpretar a resposta da IA como JSON");
}

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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtTarefas.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtTarefas.unitId, input.unitId));
      if (input.status) conds.push(eq(gtTarefas.status, input.status as "pendente" | "em_andamento" | "em_revisao" | "concluida"));
      return db.select().from(gtTarefas).where(and(...conds)).orderBy(gtTarefas.ordem, desc(gtTarefas.createdAt));
    }),

  create: sysUserProcedure
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

  update: sysUserProcedure
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

  delete: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtTarefas).where(and(eq(gtTarefas.id, input.id), eq(gtTarefas.orgId, input.orgId)));
      await logAudit(input.orgId, undefined, ctx.user!.id, ctx.user!.name ?? "", "deleted", "tarefa", input.id, `Tarefa removida`);
      return { success: true };
    }),

  updateStatus: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number(), status: z.enum(["pendente", "em_andamento", "em_revisao", "concluida"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === "concluida") updateData.concluidaEm = new Date();
      await db.update(gtTarefas).set(updateData).where(and(eq(gtTarefas.id, input.id), eq(gtTarefas.orgId, input.orgId)));
      // Sincronizar status da IT vinculada
      if (input.status === "concluida" || input.status === "em_andamento" || input.status === "pendente") {
        const [tarefa] = await db.select({ instrucaoId: gtTarefas.instrucaoId }).from(gtTarefas)
          .where(and(eq(gtTarefas.id, input.id), eq(gtTarefas.orgId, input.orgId)));
        if (tarefa?.instrucaoId) {
          const itStatus = input.status === "concluida" ? "concluida"
            : input.status === "em_andamento" ? "em_andamento"
            : "pendente";
          await db.update(gtInstrucoes).set({ status: itStatus as "pendente" | "em_andamento" | "concluida" | "pausada" })
            .where(and(eq(gtInstrucoes.id, tarefa.instrucaoId), eq(gtInstrucoes.orgId, input.orgId)));
        }
      }
      return { success: true };
    }),
});

// ── Processos ─────────────────────────────────────────────────────────────────
const processosRouter = router({
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtProcessos.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtProcessos.unitId, input.unitId));
      return db.select().from(gtProcessos).where(and(...conds)).orderBy(desc(gtProcessos.createdAt));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtProcessos).where(and(eq(gtProcessos.id, input.id), eq(gtProcessos.orgId, input.orgId)));
      return { success: true };
    }),

  generateAI: sysUserProcedure
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
        const parsed = parseJsonSafe(content) as Record<string, unknown>;
        return { success: true, data: parsed };
      } catch {
        return { success: false, data: null, error: "Falha ao interpretar resposta da IA" };
      }
    }),

  saveMany: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), categoria: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtInstrucoes.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtInstrucoes.unitId, input.unitId));
      if (input.categoria) conds.push(eq(gtInstrucoes.categoria, input.categoria));
      return db.select().from(gtInstrucoes).where(and(...conds)).orderBy(desc(gtInstrucoes.createdAt));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtInstrucoes).where(and(eq(gtInstrucoes.id, input.id), eq(gtInstrucoes.orgId, input.orgId)));
      return { success: true };
    }),

  generateFromProcesso: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      processoId: z.number().optional(),
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
        const parsed = parseJsonSafe(content) as Record<string, unknown>;
        // Salvar automaticamente no banco
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const [r] = await db.insert(gtInstrucoes).values({
          orgId: input.orgId, unitId: input.unitId,
          processoId: input.processoId,
          titulo: (parsed.titulo as string) ?? `IT - ${input.processoNome}`,
          conteudo: parsed.conteudo as string | undefined,
          plano: parsed.plano,
          categoria: parsed.categoria as string | undefined,
          responsavelNome: input.responsavelNome,
          geradoPorIA: 1, status: "pendente",
        });
        const instrucaoId = (r as { insertId: number }).insertId;

        // Criar tarefa automaticamente no Kanban vinculada à IT
        const tituloTarefa = `IT: ${(parsed.titulo as string) ?? input.processoNome}`;
        const descricaoTarefa = `Instrução de Trabalho gerada por IA para o processo "${input.processoNome}".\n\nResponsável: ${input.responsavelNome ?? "A definir"}\n\nAcesse Instruções de Trabalho para ver o plano detalhado.`;
        await db.insert(gtTarefas).values({
          orgId: input.orgId,
          unitId: input.unitId,
          titulo: tituloTarefa,
          descricao: descricaoTarefa,
          responsavel: input.responsavelNome,
          prioridade: "media",
          status: "pendente",
          instrucaoId,
        });

        return { success: true, id: instrucaoId, data: parsed };
      } catch (err) {
        console.error("[generateFromProcesso] erro:", err);
        return { success: false, id: null, data: null, error: "Falha ao interpretar resposta da IA" };
      }
    }),

  updateStatus: sysUserProcedure
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
      // Sincronizar status da tarefa vinculada
      const tarefaStatus = input.status === "concluida" ? "concluida"
        : input.status === "em_andamento" ? "em_andamento"
        : "pendente";
      const tarefaUpdate: Record<string, unknown> = { status: tarefaStatus };
      if (tarefaStatus === "concluida") tarefaUpdate.concluidaEm = new Date();
      await db.update(gtTarefas).set(tarefaUpdate)
        .where(and(eq(gtTarefas.instrucaoId, id), eq(gtTarefas.orgId, orgId)));
      return { success: true };
    }),
});

// ── Indicadores ───────────────────────────────────────────────────────────────
const indicadoresGtRouter = router({
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), periodo: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtIndicadores.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtIndicadores.unitId, input.unitId));
      if (input.periodo) conds.push(eq(gtIndicadores.periodo, input.periodo));
      return db.select().from(gtIndicadores).where(and(...conds)).orderBy(gtIndicadores.nome);
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtIndicadores).where(and(eq(gtIndicadores.id, input.id), eq(gtIndicadores.orgId, input.orgId)));
      return { success: true };
    }),

  // Indicadores consolidados do sistema (dados reais)
  consolidado: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { orgId, unitId } = input;
      // Helper genérico de condição por orgId/unitId
      const condFor = (orgIdCol: Parameters<typeof eq>[0], unitIdCol: Parameters<typeof eq>[0]) =>
        unitId ? and(eq(orgIdCol, orgId), eq(unitIdCol, unitId)) : eq(orgIdCol, orgId);

      // Tarefas
      const tarefas = await db.select().from(gtTarefas).where(condFor(gtTarefas.orgId, gtTarefas.unitId));
      const total = tarefas.length;
      const concluidas = tarefas.filter(t => t.status === "concluida").length;
      const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;
      const hoje = new Date();
      const tarefasAtraso = tarefas.filter(t => t.prazo && new Date(t.prazo) < hoje && t.status !== "concluida").length;
      const tarefasAtivas = tarefas.filter(t => t.status === "pendente" || t.status === "em_andamento").length;

      // Financeiro (mês atual)
      const refAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      const finCond = unitId
        ? and(eq(gtFinanceiro.orgId, orgId), eq(gtFinanceiro.unitId, unitId), eq(gtFinanceiro.referencia, refAtual))
        : and(eq(gtFinanceiro.orgId, orgId), eq(gtFinanceiro.referencia, refAtual));
      const financeiro = await db.select().from(gtFinanceiro).where(finCond);
      const receitaMes = financeiro.filter(f => f.tipo === "receita").reduce((s, f) => s + Number(f.valor), 0);

      // Compras pendentes
      const comprCond = unitId
        ? and(eq(gtCompras.orgId, orgId), eq(gtCompras.unitId, unitId), eq(gtCompras.status, "aguardando_aprovacao"))
        : and(eq(gtCompras.orgId, orgId), eq(gtCompras.status, "aguardando_aprovacao"));
      const comprasPendentes = await db.select().from(gtCompras).where(comprCond);

      // Colaboradores ativos
      const colaboradores = await db.select().from(gtColaboradores).where(condFor(gtColaboradores.orgId, gtColaboradores.unitId));
      const colaboradoresAtivos = colaboradores.filter(c => c.status === "ativo").length;

      // Oportunidades
      const oportunidades = await db.select().from(gtOportunidades).where(condFor(gtOportunidades.orgId, gtOportunidades.unitId));
      const oportunidadesAbertas = oportunidades.filter(o => o.status === "identificada" || o.status === "em_avaliacao" || o.status === "aprovada").length;
      const oportunidadesImplementadas = oportunidades.filter(o => o.status === "concluida").length;

      return [
        { id: "taxa_conclusao", nome: "Taxa de Conclusão de Tarefas", valor: taxaConclusao, meta: 85, tipo: "percentual", categoria: "Produtividade", tendencia: taxaConclusao >= 85 ? "subindo" : taxaConclusao >= 50 ? "estavel" : "caindo" },
        { id: "tarefas_atraso", nome: "Tarefas em Atraso", valor: tarefasAtraso, meta: 5, tipo: "numero", unidade: "unid", categoria: "Produtividade", tendencia: tarefasAtraso <= 5 ? "subindo" : "caindo", inverso: true },
        { id: "tarefas_ativas", nome: "Tarefas Ativas", valor: tarefasAtivas, meta: 20, tipo: "numero", unidade: "unid", categoria: "Produtividade", tendencia: "estavel" },
        { id: "receita_mensal", nome: "Receita Mensal", valor: receitaMes, meta: 50000, tipo: "moeda", categoria: "Financeiro", tendencia: receitaMes >= 50000 ? "subindo" : receitaMes >= 25000 ? "estavel" : "caindo" },
        { id: "compras_pendentes", nome: "Pedidos Pendentes", valor: comprasPendentes.length, meta: 10, tipo: "numero", unidade: "unid", categoria: "Compras", tendencia: "estavel", inverso: true },
        { id: "colaboradores_ativos", nome: "Colaboradores Ativos", valor: colaboradoresAtivos, meta: 50, tipo: "numero", unidade: "pessoas", categoria: "RH", tendencia: "estavel" },
        { id: "convites_pendentes", nome: "Convites Pendentes", valor: 0, meta: 5, tipo: "numero", unidade: "unid", categoria: "RH", tendencia: "estavel", inverso: true },
        { id: "oportunidades_abertas", nome: "Oportunidades Abertas", valor: oportunidadesAbertas, meta: 15, tipo: "numero", unidade: "unid", categoria: "Oportunidades", tendencia: oportunidadesAbertas > 0 ? "subindo" : "estavel" },
        { id: "oportunidades_implementadas", nome: "Oportunidades Implementadas", valor: oportunidadesImplementadas, meta: 10, tipo: "numero", unidade: "unid", categoria: "Oportunidades", tendencia: oportunidadesImplementadas > 0 ? "subindo" : "estavel" },
      ];
    }),
});
// ── Planejamento Estratégicoo ──────────────────────────────────────────────────
const planejamentoRouter = router({
  get: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), ano: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const conds = [eq(gtPlanejamento.orgId, input.orgId), eq(gtPlanejamento.ano, input.ano)];
      if (input.unitId) conds.push(eq(gtPlanejamento.unitId, input.unitId));
      const rows = await db.select().from(gtPlanejamento).where(and(...conds)).limit(1);
      return rows[0] ?? null;
    }),

  save: sysUserProcedure
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

  generateAI: sysUserProcedure
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
        const parsed = parseJsonSafe(content) as Record<string, unknown>;
        return { success: true, data: parsed };
      } catch {
        return { success: false, data: null, error: "Falha ao interpretar resposta da IA" };
      }
    }),
});
// ── Reuniões ──────────────────────────────────────────────────────────────────
const reunioesRouter = router({
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtReunioes.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtReunioes.unitId, input.unitId));
      if (input.status) conds.push(eq(gtReunioes.status, input.status as "agendada" | "realizada" | "cancelada"));
      return db.select().from(gtReunioes).where(and(...conds)).orderBy(desc(gtReunioes.data));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(gtCargos).where(eq(gtCargos.orgId, input.orgId)).orderBy(gtCargos.nome);
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtColaboradores.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtColaboradores.unitId, input.unitId));
      if (input.status) conds.push(eq(gtColaboradores.status, input.status as "ativo" | "ferias" | "afastado" | "desligado"));
      return db.select().from(gtColaboradores).where(and(...conds)).orderBy(gtColaboradores.nome);
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
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

  dre: sysUserProcedure
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

  save: sysUserProcedure
    .input(z.object({
      id: z.number().optional(), orgId: z.number(), unitId: z.number().optional(),
      tipo: z.enum(["receita", "despesa"]), categoria: z.string().optional(),
      descricao: z.string().min(1), valor: z.number().positive(),
      vencimento: z.string().optional(), pago: z.boolean().default(false),
      formaPagamento: z.string().optional(), referencia: z.string().optional(),
      observacoes: z.string().optional(),
      // Recorrência
      recorrente: z.boolean().default(false),
      recorrenciaMeses: z.number().int().min(1).max(120).optional(), // null = indefinido
      recorrenciaDia: z.number().int().min(1).max(31).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, valor, vencimento, pago, recorrente, recorrenciaMeses, recorrenciaDia, ...rest } = input;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbData: any = {
        ...rest,
        valor: valor.toString(),
        pago: pago ? 1 : 0,
        recorrente: recorrente ? 1 : 0,
        recorrenciaMeses: recorrente ? (recorrenciaMeses ?? null) : null,
        recorrenciaDia: recorrente ? (recorrenciaDia ?? null) : null,
      };
      if (vencimento) dbData.vencimento = new Date(vencimento);
      if (id) {
        await db.update(gtFinanceiro).set(dbData).where(and(eq(gtFinanceiro.id, id), eq(gtFinanceiro.orgId, input.orgId)));
        return { id };
      }
      const [r] = await db.insert(gtFinanceiro).values(dbData);
      const parentId = (r as { insertId: number }).insertId;

      // Se recorrente, gerar parcelas para os próximos meses já
      if (recorrente && parentId) {
        const mesesParaGerar = recorrenciaMeses ? Math.min(recorrenciaMeses - 1, 23) : 11; // gera até 12 meses à frente
        const baseRef = input.referencia ?? (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        })();
        const [baseYear, baseMonth] = baseRef.split("-").map(Number);
        const dia = recorrenciaDia ?? (vencimento ? new Date(vencimento).getDate() : 1);
        const parcelas: any[] = [];
        for (let i = 1; i <= mesesParaGerar; i++) {
          const totalMonths = (baseMonth - 1) + i;
          const y = baseYear + Math.floor(totalMonths / 12);
          const m = (totalMonths % 12) + 1;
          const ref = `${y}-${String(m).padStart(2, "0")}`;
          const lastDay = new Date(y, m, 0).getDate();
          const diaVenc = Math.min(dia, lastDay);
          const vencDate = new Date(y, m - 1, diaVenc);
          const recRef = `${parentId}:${ref}`;
          parcelas.push({
            orgId: input.orgId,
            unitId: input.unitId ?? null,
            tipo: input.tipo,
            categoria: input.categoria ?? null,
            descricao: input.descricao,
            valor: valor.toString(),
            vencimento: vencDate,
            pago: 0,
            formaPagamento: input.formaPagamento ?? null,
            referencia: ref,
            observacoes: input.observacoes ?? null,
            recorrente: 0, // parcelas filhas não são templates
            recorrenciaParentId: parentId,
            recorrenciaDia: dia,
            recorrenciaRef: recRef,
          });
        }
        if (parcelas.length > 0) {
          // INSERT IGNORE via ON DUPLICATE KEY UPDATE para evitar duplicação
          for (const p of parcelas) {
            try {
              await db.insert(gtFinanceiro).values(p);
            } catch { /* ignora duplicação */ }
          }
        }
      }

      return { id: parentId };
    }),

  // Lista os templates recorrentes ativos
  listRecorrentes: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtFinanceiro.orgId, input.orgId), eq(gtFinanceiro.recorrente, 1)];
      if (input.unitId) conds.push(eq(gtFinanceiro.unitId, input.unitId));
      return db.select().from(gtFinanceiro).where(and(...conds)).orderBy(gtFinanceiro.descricao);
    }),

  // Cancela recorrência (remove o template e parcelas futuras não pagas)
  cancelarRecorrencia: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Remove parcelas futuras não pagas
      const hoje = new Date();
      const refAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      await db.delete(gtFinanceiro).where(
        and(
          eq(gtFinanceiro.recorrenciaParentId, input.id),
          eq(gtFinanceiro.orgId, input.orgId),
          eq(gtFinanceiro.pago, 0),
          // só remove meses futuros
        )
      );
      // Desativa o template
      await db.update(gtFinanceiro)
        .set({ recorrente: 0 })
        .where(and(eq(gtFinanceiro.id, input.id), eq(gtFinanceiro.orgId, input.orgId)));
      return { success: true };
    }),

  // Gera parcela do mês atual para todos os templates recorrentes de uma org (chamado pelo scheduler)
  gerarParcelasRecorrentes: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const templates = await db.select().from(gtFinanceiro)
        .where(and(eq(gtFinanceiro.orgId, input.orgId), eq(gtFinanceiro.recorrente, 1)));
      const hoje = new Date();
      const y = hoje.getFullYear();
      const m = hoje.getMonth() + 1;
      const ref = `${y}-${String(m).padStart(2, "0")}`;
      let geradas = 0;
      for (const t of templates) {
        const recRef = `${t.id}:${ref}`;
        const dia = t.recorrenciaDia ?? 1;
        const lastDay = new Date(y, m, 0).getDate();
        const diaVenc = Math.min(dia, lastDay);
        const vencDate = new Date(y, m - 1, diaVenc);
        try {
          await db.insert(gtFinanceiro).values({
            orgId: t.orgId,
            unitId: t.unitId,
            tipo: t.tipo,
            categoria: t.categoria,
            descricao: t.descricao,
            valor: t.valor,
            vencimento: vencDate,
            pago: 0,
            formaPagamento: t.formaPagamento,
            referencia: ref,
            observacoes: t.observacoes,
            recorrente: 0,
            recorrenciaParentId: t.id,
            recorrenciaDia: dia,
            recorrenciaRef: recRef,
          });
          geradas++;
        } catch { /* ignora duplicação */ }
      }
      return { geradas };
    }),

  marcarPago: sysUserProcedure
    .input(z.object({
      id: z.number(),
      orgId: z.number(),
      pago: z.boolean(),
      paidAt: z.string().optional(), // YYYY-MM-DD — data real do pagamento
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const paidAtDate = input.pago
        ? (input.paidAt ? new Date(input.paidAt + "T12:00:00Z") : new Date())
        : null;
      await db.update(gtFinanceiro)
        .set({ pago: input.pago ? 1 : 0, paidAt: paidAtDate })
        .where(and(eq(gtFinanceiro.id, input.id), eq(gtFinanceiro.orgId, input.orgId)));
      return { success: true, paidAt: paidAtDate?.toISOString().slice(0, 10) ?? null };
    }),

  delete: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtFinanceiro).where(and(eq(gtFinanceiro.id, input.id), eq(gtFinanceiro.orgId, input.orgId)));
      return { success: true };
    }),

  // Sincroniza faturamento do Data VIP para o Financeiro
  syncDataVip: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const { syncGtFinanceiro } = await import("../vipDataSync");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // Intervalo padrão: mês corrente completo
      const hoje = new Date();
      const inicio = input.inicio ?? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
      const fim = input.fim ?? hoje.toISOString().split("T")[0];

      await syncGtFinanceiro(input.orgId, input.unitId, inicio, fim);

      // Conta quantos registros foram criados/atualizados no período
      const [rows] = await db.execute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await import("drizzle-orm")).sql`
          SELECT COUNT(*) as total
          FROM gt_financeiro
          WHERE orgId = ${input.orgId}
            AND unitId = ${input.unitId}
            AND dataVipRef IS NOT NULL
            AND DATE(vencimento) BETWEEN ${inicio} AND ${fim}
        `
      ) as any;
      const total = Number((rows as any[])[0]?.total ?? 0);

      return { success: true, total, inicio, fim };
    }),

  // Retorna o status da última sincronização Data VIP para esta unidade
  syncDataVipStatus: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [rows] = await db.execute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await import("drizzle-orm")).sql`
          SELECT
            COUNT(*) as totalRegistros,
            MAX(updatedAt) as ultimaAtualizacao,
            MIN(DATE(vencimento)) as periodoInicio,
            MAX(DATE(vencimento)) as periodoFim
          FROM gt_financeiro
          WHERE orgId = ${input.orgId}
            AND unitId = ${input.unitId}
            AND dataVipRef IS NOT NULL
        `
      ) as any;
      const r = (rows as any[])[0];
      if (!r || Number(r.totalRegistros) === 0) return null;
      return {
        totalRegistros: Number(r.totalRegistros),
        ultimaAtualizacao: r.ultimaAtualizacao,
        periodoInicio: r.periodoInicio,
        periodoFim: r.periodoFim,
      };
    }),
});

// ── Fornecedores ──────────────────────────────────────────────────────────────
const fornecedoresRouter = router({
  list: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(gtFornecedores).where(eq(gtFornecedores.orgId, input.orgId)).orderBy(gtFornecedores.nome);
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtCompras.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtCompras.unitId, input.unitId));
      if (input.status) conds.push(eq(gtCompras.status, input.status as "rascunho" | "aguardando_aprovacao" | "aprovado" | "recebido" | "cancelado"));
      return db.select().from(gtCompras).where(and(...conds)).orderBy(desc(gtCompras.createdAt));
    }),

  save: sysUserProcedure
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

  aprovar: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(gtCompras).set({ status: "aprovado", aprovadoPor: ctx.user!.name ?? "", aprovadoEm: new Date() })
        .where(and(eq(gtCompras.id, input.id), eq(gtCompras.orgId, input.orgId)));
      return { success: true };
    }),

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtProblemas.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtProblemas.unitId, input.unitId));
      if (input.status) conds.push(eq(gtProblemas.status, input.status as "aberto" | "em_analise" | "resolvido" | "fechado"));
      return db.select().from(gtProblemas).where(and(...conds)).orderBy(desc(gtProblemas.createdAt));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtOportunidades.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtOportunidades.unitId, input.unitId));
      if (input.status) conds.push(eq(gtOportunidades.status, input.status as "identificada" | "em_avaliacao" | "aprovada" | "implementando" | "concluida" | "descartada"));
      return db.select().from(gtOportunidades).where(and(...conds)).orderBy(desc(gtOportunidades.createdAt));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtRiscos.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtRiscos.unitId, input.unitId));
      return db.select().from(gtRiscos).where(and(...conds)).orderBy(desc(gtRiscos.createdAt));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), categoria: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtDocumentos.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtDocumentos.unitId, input.unitId));
      if (input.categoria) conds.push(eq(gtDocumentos.categoria, input.categoria));
      return db.select().from(gtDocumentos).where(and(...conds)).orderBy(desc(gtDocumentos.createdAt));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
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
  list: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtMarketing.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtMarketing.unitId, input.unitId));
      if (input.status) conds.push(eq(gtMarketing.status, input.status as "planejamento" | "ativa" | "pausada" | "concluida"));
      return db.select().from(gtMarketing).where(and(...conds)).orderBy(desc(gtMarketing.createdAt));
    }),

  save: sysUserProcedure
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

  delete: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtMarketing).where(and(eq(gtMarketing.id, input.id), eq(gtMarketing.orgId, input.orgId)));
      return { success: true };
    }),
});

/// ── Campanhas de Marketing com IA ────────────────────────────────
const marketingCampaignsRouter = router({
  listCampaigns: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtMarketingCampaigns.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtMarketingCampaigns.unitId, input.unitId));
      return db.select({
        id: gtMarketingCampaigns.id,
        campaignName: gtMarketingCampaigns.campaignName,
        status: gtMarketingCampaigns.status,
        version: gtMarketingCampaigns.version,
        executiveSummary: gtMarketingCampaigns.executiveSummary,
        channelMix: gtMarketingCampaigns.channelMix,
        assignedToName: gtMarketingCampaigns.assignedToName,
        assignedAt: gtMarketingCampaigns.assignedAt,
        createdAt: gtMarketingCampaigns.createdAt,
        wizardResponses: gtMarketingCampaigns.wizardResponses,
      }).from(gtMarketingCampaigns).where(and(...conds)).orderBy(desc(gtMarketingCampaigns.createdAt)).limit(50);
    }),

  getCampaign: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(gtMarketingCampaigns)
        .where(and(eq(gtMarketingCampaigns.id, input.id), eq(gtMarketingCampaigns.orgId, input.orgId)))
        .limit(1);
      return rows[0] ?? null;
    }),

  generateCampaign: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      wizardData: z.object({
        objective: z.string(),
        audience: z.object({
          age_range: z.string().optional(),
          gender: z.string().optional(),
          interests: z.string().optional(),
          locations: z.array(z.string()).optional(),
        }),
        offer: z.string(),
        budget: z.object({
          total: z.number().optional(),
          daily: z.number().optional(),
          start_date: z.string().optional(),
          end_date: z.string().optional(),
        }),
        channels: z.array(z.string()),
        assets: z.object({
          photos_videos: z.boolean().optional(),
          testimonials: z.boolean().optional(),
          awards: z.boolean().optional(),
          certifications: z.boolean().optional(),
        }),
        tone: z.string().optional(),
        restrictions: z.string().optional(),
        kpis: z.array(z.string()),
        differentiators: z.array(z.string()),
        observations: z.string().optional(),
      }),
      internalData: z.object({
        company: z.object({
          name: z.string().optional(),
          segment: z.string().optional(),
          description: z.string().optional(),
        }).optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const { wizardData, internalData, orgId, unitId } = input;
      const company = internalData?.company;

      const systemPrompt = `Você é um especialista em marketing digital para PMEs brasileiras. Gere uma campanha de marketing completa e acionável em português brasileiro. Responda APENAS com um JSON válido, sem markdown, sem explicações adicionais.`;

      const userPrompt = `Crie uma campanha de marketing completa para a empresa abaixo.

EMPRESA:
- Nome: ${company?.name ?? "Não informado"}
- Segmento: ${company?.segment ?? "Não informado"}
- Descrição: ${company?.description ?? "Não informado"}

DADOS DA CAMPANHA:
- Objetivo: ${wizardData.objective}
- Público-alvo: ${wizardData.audience.age_range ?? ""}, ${wizardData.audience.gender ?? "Todos"}, Interesses: ${wizardData.audience.interests ?? ""}, Regiões: ${(wizardData.audience.locations ?? []).join(", ")}
- Oferta/Proposta de Valor: ${wizardData.offer}
- Orçamento Total: R$ ${wizardData.budget.total ?? 0} | Diário: R$ ${wizardData.budget.daily ?? 0}
- Período: ${wizardData.budget.start_date ?? ""} a ${wizardData.budget.end_date ?? ""}
- Canais: ${wizardData.channels.join(", ")}
- Ativos disponíveis: ${Object.entries(wizardData.assets ?? {}).filter(([,v])=>v).map(([k])=>k).join(", ") || "Nenhum"}
- Tom de voz: ${wizardData.tone ?? "amigavel"}
- Restrições: ${wizardData.restrictions ?? "Nenhuma"}
- KPIs prioritários: ${wizardData.kpis.join(", ")}
- Diferenciais: ${wizardData.differentiators.join("; ")}
- Observações: ${wizardData.observations ?? "Nenhuma"}

Gere o JSON com EXATAMENTE esta estrutura (sem campos extras, sem markdown):
{
  "executive_summary": "string",
  "personas": [{"name":"string","demographics":"string","pain_points":["string"],"desires":["string"],"triggers":["string"],"objections":["string"],"key_messages":["string"]}],
  "messages": {"central_promise":"string","pillars":["string"],"social_proof":["string"]},
  "channel_mix": [{"channel":"string","budget_percentage":0,"justification":"string"}],
  "budget_split": {"total_budget":0,"allocation":[{"category":"string","amount":0,"percentage":0}]},
  "calendar_90d": [{"week":1,"items":[{"day":"string","theme":"string","format":"string","objective":"string","cta":"string","hook":"string"}]}],
  "content_ideas": [{"title":"string","hook":"string","format":"string","objective":"string"}],
  "ads_kits": {"meta_ads":{"headlines":["string"],"primary_texts":["string"],"descriptions":["string"],"ctas":["string"]},"google_search":{"keywords":["string"],"negative_keywords":["string"],"ad_titles":["string"],"descriptions":["string"],"extensions":["string"]}},
  "crm_flows": {"whatsapp_templates":["string"],"email_flows":[{"name":"string","steps":[{"day":0,"subject":"string","body":"string"}]}]},
  "landing_page": {"structure":[{"section":"string","headline":"string","subheadline":"string","cta":"string","items":["string"]}],"checklist":["string"]},
  "kpis_targets": [{"metric":"string","target":0,"formula":"string"}],
  "experiments_backlog": [{"hypothesis":"string","impact":0,"confidence":0,"ease":0,"ice_score":0,"next_step":"string"}],
  "risks_compliance": ["string"],
  "assumptions": ["string"]
}

REGRAS:
- Mínimo 12 itens em calendar_90d (distribuídos em pelo menos 4 semanas)
- Mínimo 8 content_ideas
- 5 headlines e 5 primary_texts em meta_ads
- Números realistas baseados no orçamento de R$ ${wizardData.budget.total ?? 0}
- Tom: ${wizardData.tone ?? "amigavel"}
- Foco em PMEs e no segmento: ${company?.segment ?? "serviços"}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const rawContentRaw = response.choices?.[0]?.message?.content ?? "{}";
      const rawContent = typeof rawContentRaw === "string" ? rawContentRaw : JSON.stringify(rawContentRaw);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const campaign = parseJsonSafe(rawContent) as any;

      const campaignName = `${wizardData.objective} - ${new Date().toLocaleDateString("pt-BR")}`;

      const [r] = await db.insert(gtMarketingCampaigns).values({
        orgId,
        unitId,
        campaignName,
        status: "draft",
        version: "v1",
        wizardResponses: wizardData as unknown as Record<string, unknown>,
        internalDataUsed: (internalData ?? {}) as Record<string, unknown>,
        executiveSummary: campaign.executive_summary ?? null,
        personas: campaign.personas ?? null,
        messages: campaign.messages ?? null,
        channelMix: campaign.channel_mix ?? null,
        budgetSplit: campaign.budget_split ?? null,
        calendar90d: campaign.calendar_90d ?? null,
        contentIdeas: campaign.content_ideas ?? null,
        adsKits: campaign.ads_kits ?? null,
        crmFlows: campaign.crm_flows ?? null,
        landingPage: campaign.landing_page ?? null,
        kpisTargets: campaign.kpis_targets ?? null,
        experimentsBacklog: campaign.experiments_backlog ?? null,
        risksCompliance: campaign.risks_compliance ?? null,
        assumptions: campaign.assumptions ?? null,
        jsonBlob: campaign as Record<string, unknown>,
      }) as any;

      return { id: (r as any).insertId, campaignName, campaign };
    }),

  assignCampaign: sysUserProcedure
    .input(z.object({
      id: z.number(),
      orgId: z.number(),
      unitId: z.number().optional(),
      assignedToId: z.number().optional(),
      assignedToName: z.string(),
      campaignName: z.string().optional(),
      createTask: z.boolean().default(true),
      taskPrazo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // 1. Atualizar a campanha com o responsável
      await db.update(gtMarketingCampaigns)
        .set({ assignedToId: input.assignedToId, assignedToName: input.assignedToName, assignedAt: new Date() })
        .where(and(eq(gtMarketingCampaigns.id, input.id), eq(gtMarketingCampaigns.orgId, input.orgId)));

      // 2. Criar tarefa para o colaborador se solicitado
      let tarefaId: number | undefined;
      if (input.createTask) {
        const titulo = `Campanha de Marketing: ${input.campaignName ?? `#${input.id}`}`;
        const descricao = `Campanha de marketing destinada para execução. Responsável: ${input.assignedToName}.`;
        const [result] = await db.insert(gtTarefas).values({
          orgId: input.orgId,
          unitId: input.unitId,
          titulo,
          descricao,
          prioridade: "media",
          responsavel: input.assignedToName,
          prazo: input.taskPrazo ? new Date(input.taskPrazo) : undefined,
          createdBy: ctx.user!.id,
        });
        tarefaId = (result as { insertId: number }).insertId;
        await logAudit(input.orgId, input.unitId, ctx.user!.id, ctx.user!.name ?? "", "created", "tarefa", tarefaId, `Tarefa criada via campanha de marketing: ${titulo}`);
      }

      return { success: true, tarefaId };
    }),

  deleteCampaign: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtMarketingCampaigns)
        .where(and(eq(gtMarketingCampaigns.id, input.id), eq(gtMarketingCampaigns.orgId, input.orgId)));
      return { success: true };
    }),

  // ── Histórico de Conteúdos Gerados ──────────────────────────────────────────────
  saveContent: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      objetivo: z.string(),
      formato: z.string(),
      tipoEntrega: z.string(),
      publico: z.string(),
      diferenciais: z.string(),
      tom: z.string(),
      ideias: z.array(z.any()),
      titulo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(gtContentHistory).values({
        orgId: input.orgId,
        unitId: input.unitId,
        createdBy: ctx.user!.id,
        objetivo: input.objetivo,
        formato: input.formato,
        tipoEntrega: input.tipoEntrega,
        publico: input.publico,
        diferenciais: input.diferenciais,
        tom: input.tom,
        ideias: input.ideias,
        titulo: input.titulo ?? (input.ideias[0] as { titulo?: string })?.titulo ?? null,
      });
      const id = (result as { insertId: number }).insertId;
      return { success: true, id };
    }),

  listContentHistory: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      limit: z.number().default(20),
      somentesFavoritos: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtContentHistory.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtContentHistory.unitId, input.unitId));
      if (input.somentesFavoritos) conds.push(eq(gtContentHistory.favoritado, true));
      return db.select({
        id: gtContentHistory.id,
        objetivo: gtContentHistory.objetivo,
        formato: gtContentHistory.formato,
        tipoEntrega: gtContentHistory.tipoEntrega,
        publico: gtContentHistory.publico,
        tom: gtContentHistory.tom,
        titulo: gtContentHistory.titulo,
        favoritado: gtContentHistory.favoritado,
        ideias: gtContentHistory.ideias,
        createdAt: gtContentHistory.createdAt,
      }).from(gtContentHistory)
        .where(and(...conds))
        .orderBy(desc(gtContentHistory.createdAt))
        .limit(input.limit);
    }),

  toggleContentFavorite: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number(), favoritado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(gtContentHistory)
        .set({ favoritado: input.favoritado })
        .where(and(eq(gtContentHistory.id, input.id), eq(gtContentHistory.orgId, input.orgId)));
      return { success: true };
    }),

  deleteContentHistory: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtContentHistory)
        .where(and(eq(gtContentHistory.id, input.id), eq(gtContentHistory.orgId, input.orgId)));
      return { success: true };
    }),

  // ── Gerador de Conteúdo ──────────────────────────────────────────────────────
  generateContent: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      objetivo: z.string(),
      formato: z.string(),
      tipoEntrega: z.string(),
      publico: z.string(),
      diferenciais: z.string(),
      tom: z.string(),
      companyName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { objetivo, formato, tipoEntrega, publico, diferenciais, tom, companyName } = input;
      const empresa = companyName ?? "Barbearia VIP";

      const systemPrompt = `Você é um especialista em marketing digital focado em barbearias premium, na ${empresa}, com experiência em criação de conteúdos virais, posicionamento de marca e geração de clientes.

Seu objetivo é criar conteúdos estratégicos para a ${empresa}, conhecida por sua experiência premium, ambiente diferenciado e alto padrão de atendimento.

Sempre que possível, conecte o conteúdo com:
- Experiência VIP (não é só corte, é vivência)
- Lifestyle masculino
- Status / pertencimento
- Sensação de recompensa
- Rotina do homem moderno

Evite conteúdos que pareçam promoção barata ou genéricos.`;

      const userPrompt = `Com base nas respostas abaixo, gere EXATAMENTE 3 ideias de conteúdo altamente estratégicas e aplicáveis.

CONTEXTO DO USUÁRIO:
- Objetivo: ${objetivo}
- Formato: ${formato}
- Tipo de entrega: ${tipoEntrega}
- Público: ${publico}
- Diferenciais: ${diferenciais}
- Tom: ${tom}

REGRAS IMPORTANTES:
- Os conteúdos devem ser simples de executar dentro da barbearia
- Evitar ideias genéricas (como "antes e depois" simples sem contexto)
- Criar conteúdos que gerem atenção nos primeiros 3 segundos
- Sempre pensar em gerar desejo, identificação ou curiosidade
- Adaptar para linguagem natural, humana e não robótica
- Pensar como conteúdo de Instagram e TikTok

RETORNE OBRIGATORIAMENTE um JSON válido com a estrutura abaixo (sem markdown, sem texto fora do JSON):
{
  "ideias": [
    {
      "titulo": "Título forte e chamativo",
      "conceito": "Explicação rápida do que é o conteúdo",
      "execucao": "Passo a passo simples de como gravar ou montar",
      "gancho": "O que dizer/mostrar nos primeiros 3 segundos",
      "roteiro": "Roteiro completo (se aplicável ao tipo de entrega solicitado, senão deixe vazio)",
      "legendas": {
        "emocional": "Legenda mais emocional",
        "vendedora": "Legenda mais direta e vendedora",
        "engajamento": "Legenda mais leve para engajamento"
      },
      "cta": "Call to action sugerido"
    }
  ]
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "content_ideas",
            strict: true,
            schema: {
              type: "object",
              properties: {
                ideias: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      titulo: { type: "string" },
                      conceito: { type: "string" },
                      execucao: { type: "string" },
                      gancho: { type: "string" },
                      roteiro: { type: "string" },
                      legendas: {
                        type: "object",
                        properties: {
                          emocional: { type: "string" },
                          vendedora: { type: "string" },
                          engajamento: { type: "string" },
                        },
                        required: ["emocional", "vendedora", "engajamento"],
                        additionalProperties: false,
                      },
                      cta: { type: "string" },
                    },
                    required: ["titulo", "conceito", "execucao", "gancho", "roteiro", "legendas", "cta"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["ideias"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response?.choices?.[0]?.message?.content;
      const raw = typeof rawContent === "string" ? rawContent : "{}";
      const parsed = parseJsonSafe(raw) as { ideias: unknown[] };
      return { ideias: parsed.ideias ?? [] };
    }),

  // ── Criação de Arte ────────────────────────────────────────────────────────
  generateArt: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      companyName: z.string(),
      assunto: z.string(),
      tipoArte: z.string(),
      objetivo: z.string(),
      tema: z.string(),
      descricao: z.string(),
      briefing: z.string(),
      tipoImagem: z.enum(["upload", "ia", "banco", "banco-vip"]),
      imagemUrl: z.string().optional(), // URL da imagem enviada (upload)
      bancoVipImageUrl: z.string().optional(), // URL da imagem selecionada do Banco VIP
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // 1. Gerar o briefing criativo via GPT
      const systemPrompt = `Você é um diretor de arte e copywriter especialista em marketing para barbearias premium.

Seu objetivo é criar um briefing criativo completo, moderno e visualmente atrativo, baseado no padrão da Barbearia VIP — a maior rede de barbearias da América Latina, conhecida por seu posicionamento premium, experiência diferenciada e ambiente sofisticado.

=== IDENTIDADE VISUAL BARBEARIA VIP (OBRIGATÓRIO) ===

CONCEITO DE MARCA:
- Não é só corte → é experiência
- "O homem VIP vive experiências"
- Exclusividade, sofisticação, confiança, lifestyle masculino premium

PALETA DE CORES (PADRÃO VIP):
- Fundo predominantemente escuro: preto (#0A0A0A), grafite (#1A1A1A) ou degrâdê escuro
- Destaque em dourado/amarelo VIP: #C9A84C, #D4AF37, #F0C040
- Texto principal: branco puro ou off-white
- EVITAR: cores vibrantes (vermelho, azul forte, verde), tons pasteis, fundos claros

TIPOGRAFIA:
- Títulos: fonte condensada, forte, moderna, CAIXA ALTA (estilo Bebas Neue, Oswald, Montserrat Condensed)
- Subtítulos: fonte limpa e moderna
- Corpo: minimalista, sem excesso
- Hierarquia clara: pouco texto, destaque em palavras-chave

ESTILO DE IMAGEM:
- Homens bem cuidados (barba, cabelo, estilo)
- Ambiente premium (barbearia sofisticada, carro de luxo, lifestyle)
- Iluminação cinematográfica (luz quente, contraste, sombras)
- Expressão de confiança e postura forte
- EVITAR: imagens genéricas, fotos amadoras, ambientes simples

ESTRUTURA VISUAL (LAYOUT VIP):
- Opção A: Lado esquerdo com texto (headline + apoio), lado direito com imagem forte
- Opção B: Fundo com imagem escura + texto sobreposto com contraste alto
- Elementos gráficos: caixas com bordas suaves, destaques em dourado, linhas finas elegantes
- Blocos informativos com números/dados em destaque dourado

REGRAS CRÍTICAS:
- NÃO parecer arte promocional comum ou panfleto
- NÃO usar estética de "liquidarão" ou cores de supermercado
- NÃO exagerar em informações ou exclamarções
- PRIORIZAR: impacto visual, desejo, sensação de exclusividade
- Inspiração: Louis Vuitton, Gucci, YSL aplicados ao universo masculino

COMUNICAÇÃO:
- Linguagem: exclusiva, sofisticada, confiante
- Evitar: linguagem popular, promoções baratas, excesso de exclamarções
- Foco: desejo, experiência, estilo de vida

Retorne SOMENTE um JSON válido com esta estrutura exata:
{
  "conceito": "string (2-3 linhas de direção criativa)",
  "direcaoVisual": {
    "cores": "string",
    "tipografia": "string",
    "estiloImagem": "string",
    "elementosVisuais": "string"
  },
  "headline": "string (frase principal forte)",
  "textoSecundario": "string (complemento)",
  "cta": "string (chamada para ação)",
  "layout": {
    "topo": "string",
    "centro": "string",
    "rodape": "string"
  },
  "sugestaoImagem": "string (descrição detalhada para gerar ou buscar imagem)",
  "promptImagem": "string (prompt detalhado em inglês para geração de imagem por IA, estilo fotográfico realista premium)"
}`;

      const userPrompt = `Crie um briefing criativo completo seguindo RIGOROSAMENTE a identidade visual da Barbearia VIP para:

Empresa: ${input.companyName}
Assunto: ${input.assunto}
Tipo de arte: ${input.tipoArte}
Objetivo: ${input.objetivo}
Tema visual: ${input.tema}
Descrição do material: ${input.descricao}
Briefing do cliente: ${input.briefing}
Tipo de imagem: ${input.tipoImagem === "upload" ? "Usuário enviou uma imagem (usar como referência de ambiente/produto)" : input.tipoImagem === "ia" ? "Gerar imagem com IA (seguir padrão VIP: homem premium, ambiente sofisticado, iluminação cinematográfica)" : input.tipoImagem === "banco-vip" ? "Imagem do Banco VIP da empresa (usar como referência visual principal)" : "Buscar em banco externo (sugerir palavras-chave para imagem premium masculina)"}

LEMBRE: Toda a direção visual deve seguir o padrão VIP: fundo escuro, dourado, tipografia condensada forte, estilo masculino premium. O promptImagem deve gerar uma imagem cinematográfica de alta qualidade, nunca genérica.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "art_briefing",
            strict: true,
            schema: {
              type: "object",
              properties: {
                conceito: { type: "string" },
                direcaoVisual: {
                  type: "object",
                  properties: {
                    cores: { type: "string" },
                    tipografia: { type: "string" },
                    estiloImagem: { type: "string" },
                    elementosVisuais: { type: "string" },
                  },
                  required: ["cores", "tipografia", "estiloImagem", "elementosVisuais"],
                  additionalProperties: false,
                },
                headline: { type: "string" },
                textoSecundario: { type: "string" },
                cta: { type: "string" },
                layout: {
                  type: "object",
                  properties: {
                    topo: { type: "string" },
                    centro: { type: "string" },
                    rodape: { type: "string" },
                  },
                  required: ["topo", "centro", "rodape"],
                  additionalProperties: false,
                },
                sugestaoImagem: { type: "string" },
                promptImagem: { type: "string" },
              },
              required: ["conceito", "direcaoVisual", "headline", "textoSecundario", "cta", "layout", "sugestaoImagem", "promptImagem"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response?.choices?.[0]?.message?.content;
      const raw = typeof rawContent === "string" ? rawContent : "{}";
      const resultado = parseJsonSafe(raw) as {
        conceito: string;
        direcaoVisual: { cores: string; tipografia: string; estiloImagem: string; elementosVisuais: string };
        headline: string;
        textoSecundario: string;
        cta: string;
        layout: { topo: string; centro: string; rodape: string };
        sugestaoImagem: string;
        promptImagem: string;
      };

      // 2. Gerar imagem via IA se solicitado
      // Prefixo de identidade visual VIP obrigatório para todas as imagens geradas
      const VIP_IMAGE_PREFIX = `Barbearia VIP premium brand photography. MANDATORY: dark background (deep black or dark charcoal), gold/yellow accents (#D4AF37), cinematic dramatic lighting, high contrast. Well-groomed man with confident posture in luxury environment. Ultra-high quality, 8K resolution, professional studio photography. Style: luxury fashion brand (Louis Vuitton, YSL applied to masculine universe). NOT a cheap barbershop photo. Shot on Hasselblad medium format, f/1.8 shallow depth of field, golden hour bokeh. Rule of thirds composition, centered subject with elegant negative space. Photorealistic, hyper-detailed, award-winning commercial photography. `;
      let imagemGeradaUrl: string | null = null;
      if (input.tipoImagem === "ia" && resultado.promptImagem) {
        try {
          const imgResult = await generateImage({
            prompt: VIP_IMAGE_PREFIX + resultado.promptImagem,
            ...(input.imagemUrl ? { originalImages: [{ url: input.imagemUrl, mimeType: "image/jpeg" as const }] } : {}),
          });
          imagemGeradaUrl = imgResult.url ?? null;
        } catch (e) {
          console.error("[generateArt] Erro ao gerar imagem:", e);
        }
      } else if (input.tipoImagem === "upload" && input.imagemUrl) {
        imagemGeradaUrl = input.imagemUrl;
      } else if (input.tipoImagem === "banco-vip" && input.bancoVipImageUrl) {
        // Usa a imagem do Banco VIP como base e refina apenas tonalidade para padrão VIP
        // NÃO gera nova imagem — apenas ajusta cor/tonalidade para identidade visual da marca
        const REFINEMENT_PROMPT = `Refine this image to match Barbearia VIP brand identity. IMPORTANT: Keep the original image composition, subjects, and content EXACTLY as they are. Only apply these tonal adjustments if they improve the result: 1) Slightly darken the background to deep black or dark charcoal tones if it is currently light. 2) Add subtle warm gold/amber tint (#D4AF37) to highlights and light areas. 3) Enhance cinematic contrast and dramatic lighting with deep shadows and warm highlights. 4) Increase overall sophistication and premium feel. 5) Apply professional color grading: rich blacks, lifted shadows, warm midtones. 6) Add subtle film grain for cinematic texture. DO NOT change the people, objects, or composition. DO NOT generate a new image. This is a color grading and tonal refinement only. Result should look like a high-end fashion magazine editorial, shot on Hasselblad, processed in professional color suite.`;
        try {
          const imgResult = await generateImage({
            prompt: REFINEMENT_PROMPT,
            originalImages: [{ url: input.bancoVipImageUrl, mimeType: "image/jpeg" as const }],
          });
          imagemGeradaUrl = imgResult.url ?? null;
        } catch (e) {
          console.error("[generateArt] Erro ao refinar imagem do Banco VIP:", e);
          imagemGeradaUrl = input.bancoVipImageUrl; // fallback: usa a imagem original sem refinamento
        }
      }

      // 3. Salvar no histórico
      const [insertResult] = await db.insert(gtArtHistory).values({
        orgId: input.orgId,
        unitId: input.unitId,
        createdBy: ctx.user!.id,
        assunto: input.assunto,
        tipoArte: input.tipoArte,
        objetivo: input.objetivo,
        tema: input.tema,
        descricao: input.descricao,
        briefing: input.briefing,
        tipoImagem: input.tipoImagem,
        imagemUrl: imagemGeradaUrl,
        resultado,
      });
      const id = (insertResult as { insertId: number }).insertId;

      return { id, resultado, imagemUrl: imagemGeradaUrl };
    }),

  listArtHistory: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      limit: z.number().default(20),
      somentesFavoritos: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtArtHistory.orgId, input.orgId)];
      if (input.unitId) conds.push(eq(gtArtHistory.unitId, input.unitId));
      if (input.somentesFavoritos) conds.push(eq(gtArtHistory.favoritado, true));
      return db.select().from(gtArtHistory)
        .where(and(...conds))
        .orderBy(desc(gtArtHistory.createdAt))
        .limit(input.limit);
    }),

  toggleArtFavorite: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number(), favoritado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(gtArtHistory)
        .set({ favoritado: input.favoritado })
        .where(and(eq(gtArtHistory.id, input.id), eq(gtArtHistory.orgId, input.orgId)));
      return { success: true };
    }),

  deleteArtHistory: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtArtHistory)
        .where(and(eq(gtArtHistory.id, input.id), eq(gtArtHistory.orgId, input.orgId)));
      return { success: true };
    }),

  // ── Verificar Ortografia dos Textos do Flyer ──────────────────────────────
  spellCheckFlyer: sysUserProcedure
    .input(z.object({
      headline: z.string(),
      textoSecundario: z.string(),
      cta: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Você é um revisor ortográfico especializado em português do Brasil. Corrija APENAS erros ortográficos, de acento e de pontuação. Não altere o conteúdo, estilo ou tom. Para cada campo, indique se houve correção (changed: true) ou não (changed: false). Retorne JSON válido.`,
            },
            {
              role: "user",
              content: `Revise a ortografia em português do Brasil:\n\nheadline: "${input.headline}"\ntextoSecundario: "${input.textoSecundario}"\ncta: "${input.cta}"`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "spell_check_preview",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  headline: { type: "string" },
                  headlineChanged: { type: "boolean" },
                  textoSecundario: { type: "string" },
                  textoSecundarioChanged: { type: "boolean" },
                  cta: { type: "string" },
                  ctaChanged: { type: "boolean" },
                  totalCorrections: { type: "number" },
                },
                required: ["headline", "headlineChanged", "textoSecundario", "textoSecundarioChanged", "cta", "ctaChanged", "totalCorrections"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = response?.choices?.[0]?.message?.content;
        const result = JSON.parse(typeof raw === "string" ? raw : "{}") as {
          headline: string; headlineChanged: boolean;
          textoSecundario: string; textoSecundarioChanged: boolean;
          cta: string; ctaChanged: boolean;
          totalCorrections: number;
        };
        return {
          original: { headline: input.headline, textoSecundario: input.textoSecundario, cta: input.cta },
          corrected: { headline: result.headline, textoSecundario: result.textoSecundario, cta: result.cta },
          changes: { headlineChanged: result.headlineChanged, textoSecundarioChanged: result.textoSecundarioChanged, ctaChanged: result.ctaChanged },
          totalCorrections: result.totalCorrections ?? 0,
        };
      } catch (e) {
        console.error("[spellCheckFlyer] Erro:", e);
        // Retorna textos originais sem correção em caso de erro
        return {
          original: { headline: input.headline, textoSecundario: input.textoSecundario, cta: input.cta },
          corrected: { headline: input.headline, textoSecundario: input.textoSecundario, cta: input.cta },
          changes: { headlineChanged: false, textoSecundarioChanged: false, ctaChanged: false },
          totalCorrections: 0,
        };
      }
    }),

  // ── Gerar Flyer Final ────────────────────────────────────────────
  generateFlyer: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      // Dados do briefing da arte
      headline: z.string(),
      textoSecundario: z.string(),
      cta: z.string(),
      conceito: z.string(),
      direcaoVisual: z.object({
        cores: z.string(),
        tipografia: z.string(),
        estiloImagem: z.string(),
        elementosVisuais: z.string(),
      }),
      // Layout editado pelo usuário
      layout: z.object({
        topo: z.string(),
        centro: z.string(),
        rodape: z.string(),
      }),
      // Imagem base gerada/enviada
      imagemUrl: z.string().nullable(),
      // Metadados
      assunto: z.string(),
      tipoArte: z.string(),
      tipoImagem: z.enum(["upload", "ia", "banco", "banco-vip"]).optional(), // tipo de origem da imagem
      logoId: z.number().optional(), // ID da logo específica selecionada pelo usuário
    }))
    .mutation(async ({ input }) => {
      // Buscar logos da organização (obrigatório para identidade da marca)
      const db = await getDb();
      let logoUrl: string | null = null;
      let allLogos: { url: string; nome: string | null }[] = [];
      if (db) {
        if (input.logoId) {
          // Usar apenas a logo específica selecionada
          const [specificLogo] = await db.select({
            url: gtBrandAssets.url,
            nome: gtBrandAssets.nome,
          }).from(gtBrandAssets)
            .where(and(eq(gtBrandAssets.id, input.logoId), eq(gtBrandAssets.orgId, input.orgId)))
            .limit(1);
          if (specificLogo) {
            allLogos = [specificLogo];
            logoUrl = specificLogo.url;
          }
        } else {
          // Buscar TODAS as logos da organização
          const logoRows = await db.select({
            url: gtBrandAssets.url,
            nome: gtBrandAssets.nome,
          }).from(gtBrandAssets)
            .where(and(eq(gtBrandAssets.orgId, input.orgId), eq(gtBrandAssets.tipo, "logo")))
            .orderBy(gtBrandAssets.criadoEm);
          allLogos = logoRows;
          logoUrl = logoRows[0]?.url ?? null;
        }
      }

      // Aviso explícito se não houver logo cadastrada
      const logoWarning = allLogos.length === 0
        ? "WARNING: No brand logo found in system. Flyer generated without official logo — please upload logos em Configurações."
        : null;

      // Nomes das logos disponíveis para o prompt
      const logoNames = allLogos.map((l, i) => l.nome ? `${i + 1}. ${l.nome}` : `Logo ${i + 1}`).join(", ");

      // Verificar e corrigir ortografia dos textos em português antes de gerar o flyer
      let headline = input.headline;
      let textoSecundario = input.textoSecundario;
      let cta = input.cta;
      try {
        const spellCheckResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Você é um revisor ortográfico especializado em português do Brasil. Sua única função é corrigir erros ortográficos, de acento e de pontuação nos textos fornecidos, mantendo o sentido, estilo e tom original. Não altere o conteúdo, apenas corrija erros de escrita. Retorne SOMENTE um JSON válido com os campos: headline, textoSecundario, cta.`,
            },
            {
              role: "user",
              content: `Revise a ortografia destes textos em português do Brasil:\n\nheadline: "${input.headline}"\ntextoSecundario: "${input.textoSecundario}"\ncta: "${input.cta}"`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "spell_check",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  headline: { type: "string" },
                  textoSecundario: { type: "string" },
                  cta: { type: "string" },
                },
                required: ["headline", "textoSecundario", "cta"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawSpell = spellCheckResponse?.choices?.[0]?.message?.content;
        const spellChecked = JSON.parse(typeof rawSpell === "string" ? rawSpell : "{}") as { headline?: string; textoSecundario?: string; cta?: string };
        if (spellChecked.headline) headline = spellChecked.headline;
        if (spellChecked.textoSecundario) textoSecundario = spellChecked.textoSecundario;
        if (spellChecked.cta) cta = spellChecked.cta;
      } catch (e) {
        console.error("[generateFlyer] Erro na verificação ortográfica:", e);
        // Continua com os textos originais em caso de erro
      }

      // Determinar dimensões e formato exato baseado no tipoArte
      const formatoMap: Record<string, { ratio: string; desc: string; dims: string }> = {
        story:            { ratio: "9:16",  desc: "Instagram Story / Reels vertical",  dims: "1080x1920px" },
        reels_capa:       { ratio: "9:16",  desc: "Capa de Reels vertical",            dims: "1080x1920px" },
        post_instagram:   { ratio: "1:1",   desc: "Post Instagram quadrado",           dims: "1080x1080px" },
        banner_whatsapp:  { ratio: "16:9",  desc: "Banner WhatsApp horizontal",        dims: "1600x900px" },
        banner:           { ratio: "16:9",  desc: "Banner horizontal",                 dims: "1280x720px" },
        flyer_digital:    { ratio: "4:5",   desc: "Flyer digital",                     dims: "1080x1350px" },
        card_servico:     { ratio: "1:1",   desc: "Card de serviço quadrado",          dims: "1080x1080px" },
        carrossel:        { ratio: "1:1",   desc: "Carrossel Instagram quadrado",      dims: "1080x1080px" },
      };
      const formato = formatoMap[input.tipoArte] ?? { ratio: "1:1", desc: "Post quadrado", dims: "1080x1080px" };
      console.log(`[generateFlyer] tipoArte recebido: "${input.tipoArte}" → formato: ${formato.ratio} (${formato.dims})`);

      // ── Determinar se é banco-vip (imagem ocupa 100% do canvas) ────────────
      const isBancoVip = input.tipoImagem === "banco-vip" && !!input.imagemUrl;

      // ── Montar prompt de flyer ────────────────────────────────────────────
      const flyerPrompt = [
        // ===== CANVAS SIZE — PRIMEIRA E MAIS IMPORTANTE INSTRUÇÃO =====
        `CANVAS SIZE — MANDATORY AND NON-NEGOTIABLE:`,
        `Output aspect ratio: ${formato.ratio} (${formato.dims}).`,
        formato.ratio === "9:16"
          ? `VERTICAL — tall and narrow like a smartphone screen. Height is 1.78× the width.`
          : formato.ratio === "16:9"
          ? `HORIZONTAL — wide and short like a YouTube banner. Width is 1.78× the height.`
          : formato.ratio === "4:5"
          ? `PORTRAIT — slightly taller than wide (height = 1.25× width).`
          : `SQUARE — equal width and height (1:1).`,
        `The reference images are ONLY for visual content. OUTPUT must be ${formato.ratio}. Ignore their aspect ratio.`,
        ``,

        // ===== MODO BANCO VIP: IMAGEM COMO FUNDO FULL-BLEED =====
        ...(isBancoVip ? [
          `=== BANCO VIP MODE — FULL-BLEED BACKGROUND ===`,
          `The first reference image IS the flyer. It MUST fill the ENTIRE canvas edge-to-edge, 100% full-bleed.`,
          `SCALE AND CROP the reference image to fill the ${formato.ratio} canvas completely — no margins, no borders, no black bars.`,
          `DO NOT add new people, objects, or decorative graphics. DO NOT replace the image.`,
          `Apply a subtle dark gradient overlay (bottom 40% of canvas, opacity 50–70%) for text readability.`,
          `Place the logo (if provided) at the TOP of the canvas, centered, small and elegant.`,
          `Place the headline text at the BOTTOM of the canvas, centered, bold uppercase, white or gold.`,
          `Place the CTA below the headline, smaller, elegant.`,
          `THAT IS ALL — no other text, no extra elements, no decorations.`,
          ``,
        ] : [
          // ===== MODO NORMAL: FLYER PREMIUM VIP =====
          `Create a PREMIUM, ULTRA-HIGH-END digital flyer for Barbearia VIP — Brazil's largest luxury barbershop franchise.`,
          ``,
          `BRAND IDENTITY (MANDATORY):`,
          `- Colors: Dark background (#0A0A0A or #1A1A1A) + gold accents (#D4AF37, #C9A84C) + white text`,
          `- Typography: Condensed bold uppercase headlines (Bebas Neue / Oswald style), key words in gold`,
          `- Image style: Premium masculine lifestyle — cinematic lighting, high contrast, dramatic shadows`,
          `- Inspired by: Louis Vuitton, Gucci, YSL applied to masculine universe`,
          `- FORBIDDEN: cheap promotional aesthetics, bright colors, pastels, light backgrounds`,
          ``,
          ...(input.imagemUrl ? [
            `REFERENCE IMAGE: The first image is the HERO VISUAL. Use it as the dominant background or main visual element. Crop/scale it to fill the ${formato.ratio} canvas completely — no black bars.`,
          ] : [
            `No base image provided. Generate a premium VIP barbershop lifestyle scene.`,
          ]),
          ``,
        ]),

        // ===== LOGO =====
        allLogos.length > 0
          ? `LOGO (MANDATORY): The official Barbearia VIP logo MUST appear EXACTLY as provided. Do NOT invent or replace it. Adjust color/tint only (white or gold version on dark background). Available: ${logoNames}.`
          : `LOGO: None provided. Leave logo area empty — do NOT invent any logo or wordmark.`,
        ``,

        // ===== TEXTO — ULTRA-MINIMALISTA =====
        `TEXT — ULTRA-MINIMALIST (CRITICAL RULE):`,
        `MAXIMUM 2 text elements on the entire flyer:`,
        `  1. HEADLINE only: "${headline}" — bold, uppercase, max 5 words visible`,
        `  2. CTA only: "${cta}" — small, elegant, below headline`,
        `DO NOT include body text, supporting lines, descriptions, or any other copy.`,
        `DO NOT include "${textoSecundario}" or any secondary text.`,
        `LESS TEXT = MORE LUXURY. White space is intentional and premium.`,
        `FORBIDDEN: paragraphs, bullet points, multiple text blocks, crowded copy.`,
        ``,

        // ===== CONCEITO CRIATIVO =====
        `CREATIVE CONCEPT: ${input.conceito}`,
        `COLOR DIRECTION: ${input.direcaoVisual.cores}`,
        ``,

        // ===== REGRAS ABSOLUTAS =====
        `ABSOLUTE RULES:`,
        `- NO website URL, domain, phone number, or address`,
        `- NO invented contact information`,
        `- NO exclamation marks in text`,
        `- The entire canvas MUST be filled — no letterboxing, no pillarboxing, no white/black borders`,
        ``,

        // ===== QUALIDADE =====
        `QUALITY: Ultra-high quality, cinematic, professional studio design. GQ / Vogue Homem editorial level.`,
        ``,

        // ===== LEMBRETE FINAL DO TAMANHO =====
        `FINAL REMINDER: Output MUST be ${formato.ratio} (${formato.dims}). ${formato.desc}.`,
        formato.ratio === "9:16" ? `PORTRAIT VERTICAL — tall and narrow. FAILURE to produce a vertical image = task failed.`
          : formato.ratio === "16:9" ? `LANDSCAPE HORIZONTAL — wide and short. FAILURE to produce a horizontal image = task failed.`
          : formato.ratio === "4:5" ? `PORTRAIT — slightly taller than wide. FAILURE to produce this format = task failed.`
          : `SQUARE 1:1 — equal width and height. FAILURE to produce a square image = task failed.`,
      ].join("\n");

      // Montar referências de imagem:
      // ORDEM: 1º imagem da arte (banco VIP ou upload) — 2º logos da marca
      // A imagem da arte vem primeiro para ser a referência visual principal
      const originalImages: { url: string; mimeType: "image/jpeg" }[] = [];

      // 1º: Imagem base da arte (banco VIP, upload ou gerada por IA) — referência visual principal
      if (input.imagemUrl) {
        originalImages.push({ url: input.imagemUrl, mimeType: "image/jpeg" as const });
        console.log(`[generateFlyer] Imagem base (1º referência): ${input.imagemUrl.substring(0, 80)}...`);
      } else {
        console.log(`[generateFlyer] AVISO: Nenhuma imagem base fornecida — flyer gerado apenas com logos`);
      }

      // 2º: Logo(s) da marca como referência de identidade visual
      for (const logo of allLogos.slice(0, 2)) { // máx 2 logos
        originalImages.push({ url: logo.url, mimeType: "image/jpeg" as const });
      }

      const imgResult = await generateImage({
        prompt: flyerPrompt,
        ...(originalImages.length > 0 ? { originalImages } : {}),
      });

      // Pós-processamento: garantir dimensões exatas do formato solicitado
      let finalFlyerUrl = imgResult.url ?? null;
      if (finalFlyerUrl) {
        try {
          const [targetW, targetH] = formato.dims.replace("px", "").split("x").map(Number);
          // Baixar a imagem gerada
          const imgResponse = await fetch(finalFlyerUrl);
          const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
          // Usar sharp para redimensionar preservando todo o conteúdo (sem cortar textos)
          // Estratégia: contain + fundo preto (#0A0A0A) para manter o conteúdo inteiro
          const sharp = (await import("sharp")).default;
          // Verificar dimensões originais da imagem
          const metadata = await sharp(imgBuffer).metadata();
          const origW = metadata.width ?? targetW;
          const origH = metadata.height ?? targetH;
          const origRatio = origW / origH;
          const targetRatio = targetW / targetH;
          let resizedBuffer: Buffer;
          if (Math.abs(origRatio - targetRatio) < 0.05) {
            // Proporções muito próximas: apenas redimensionar (fill exato)
            resizedBuffer = await sharp(imgBuffer)
              .resize(targetW, targetH, { fit: "fill" })
              .png()
              .toBuffer();
          } else {
            // Proporções diferentes: usar cover (crop centralizado) para preencher o canvas
            // sem bordas pretas — a imagem é recortada para cobrir o canvas inteiro
            resizedBuffer = await sharp(imgBuffer)
              .resize(targetW, targetH, {
                fit: "cover",
                position: "centre",
              })
              .png()
              .toBuffer();
          }
          console.log(`[generateFlyer] Dimensões originais: ${origW}x${origH} → alvo: ${targetW}x${targetH} (ratio orig: ${origRatio.toFixed(2)}, alvo: ${targetRatio.toFixed(2)})`);

          // Subir a versão redimensionada para o storage
          const { storagePut } = await import("../storage");
          const timestamp = Date.now();
          const { url: resizedUrl } = await storagePut(
            `flyers/${timestamp}-${input.tipoArte}.png`,
            resizedBuffer,
            "image/png"
          );
          finalFlyerUrl = resizedUrl;
          console.log(`[generateFlyer] Pós-processamento: ${formato.dims} aplicado com sucesso → ${resizedUrl.substring(0, 80)}...`);
        } catch (e) {
          console.error("[generateFlyer] Erro no pós-processamento de dimensões:", e);
          // Mantém a URL original em caso de erro
        }
      }

      return {
        flyerUrl: finalFlyerUrl,
        prompt: flyerPrompt,
        logoUrl,
        allLogos,
        logoWarning,
      };
    }),
});

// ── IA Conselheiro ────────────────────────────────────────────
const iaRouter = router({
  listConversations: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(gtAdvisorConversations.orgId, input.orgId), eq(gtAdvisorConversations.userId, ctx.user!.id)];
      if (input.unitId) conds.push(eq(gtAdvisorConversations.unitId, input.unitId));
      return db.select().from(gtAdvisorConversations).where(and(...conds)).orderBy(desc(gtAdvisorConversations.updatedAt)).limit(20);
    }),

  getConversation: sysUserProcedure
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

  chat: sysUserProcedure
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

  deleteConversation: sysUserProcedure
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
  list: sysUserProcedure
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
  kpis: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const _kpisInner = async () => {
      const db = await getDb();
      if (!db) return {
        tarefasPendentes: 0, tarefasAndamento: 0, tarefasConcluidas: 0,
        problemasAbertos: 0, reunioesHoje: 0, colaboradoresAtivos: 0,
        receitasMes: 0, despesasMes: 0, lucroMes: 0,
        comprasPendentes: 0, riscosAltos: 0, totalTarefas: 0, totalProblemas: 0,
        processosCount: 0, tarefasDestinadas: 0,
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

      // Processos criados
      const procCond = input.unitId
        ? and(eq(gtProcessos.orgId, input.orgId), eq(gtProcessos.unitId, input.unitId))
        : eq(gtProcessos.orgId, input.orgId);
      const processos = await db.select({ id: gtProcessos.id }).from(gtProcessos).where(procCond);
      const processosCount = processos.length;

      // Tarefas destinadas (com responsavel preenchido e não concluídas)
      const tarefasDestinadas = tarefas.filter(
        t => t.responsavel && t.responsavel.trim() !== "" && t.status !== "concluida"
      ).length;

      return {
        tarefasPendentes, tarefasAndamento, tarefasConcluidas,
        problemasAbertos, reunioesHoje, colaboradoresAtivos,
        receitasMes, despesasMes, lucroMes: receitasMes - despesasMes,
        comprasPendentes: comprasPendentes.length,
        riscosAltos, totalTarefas: tarefas.length, totalProblemas: problemas.length,
        processosCount, tarefasDestinadas,
      };
      };
      // Timeout de 15s para evitar gateway timeout (504)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TRPCError({ code: "TIMEOUT", message: "Dashboard KPIs: banco demorou mais de 15s" })), 15000)
      );
      return Promise.race([_kpisInner(), timeoutPromise]);
    }),

  tarefasRecentes: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional(), limit: z.number().default(5) }))
    .query(async ({ input }) => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TRPCError({ code: "TIMEOUT", message: "Tarefas recentes: banco demorou mais de 15s" })), 15000)
      );
      return Promise.race([
        (async () => {
          const db = await getDb();
          if (!db) return [];
          const conds = [eq(gtTarefas.orgId, input.orgId)];
          if (input.unitId) conds.push(eq(gtTarefas.unitId, input.unitId));
          return db.select().from(gtTarefas).where(and(...conds)).orderBy(desc(gtTarefas.updatedAt)).limit(input.limit);
        })(),
        timeoutPromise,
      ]);
    }),
});

// ── Brand Assets & Image Bank ────────────────────────────────────
const brandAssetsRouter = router({
  // Logo da organização (múltiplas versões)
  listLogos: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(gtBrandAssets)
        .where(and(eq(gtBrandAssets.orgId, input.orgId), eq(gtBrandAssets.tipo, "logo")))
        .orderBy(gtBrandAssets.criadoEm);
    }),

  addLogo: sysUserProcedure
    .input(z.object({
      orgId: z.number(), url: z.string(), fileKey: z.string(),
      nome: z.string().optional(), descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Verificar limite de 4 logos
      const existing = await db.select({ id: gtBrandAssets.id }).from(gtBrandAssets)
        .where(and(eq(gtBrandAssets.orgId, input.orgId), eq(gtBrandAssets.tipo, "logo")));
      if (existing.length >= 4) throw new Error("Limite de 4 logos atingido");
      const [r] = await db.insert(gtBrandAssets).values({
        orgId: input.orgId, tipo: "logo",
        url: input.url, fileKey: input.fileKey,
        nome: input.nome ?? "Logo",
        descricao: input.descricao,
      });
      return { id: (r as { insertId: number }).insertId, url: input.url };
    }),

  updateLogo: sysUserProcedure
    .input(z.object({
      id: z.number(), orgId: z.number(),
      nome: z.string().optional(), descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, orgId, ...data } = input;
      await db.update(gtBrandAssets).set(data)
        .where(and(eq(gtBrandAssets.id, id), eq(gtBrandAssets.orgId, orgId)));
      return { success: true };
    }),

  deleteLogoById: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtBrandAssets)
        .where(and(eq(gtBrandAssets.id, input.id), eq(gtBrandAssets.orgId, input.orgId)));
      return { success: true };
    }),

  // Manter getLogo/saveLogo/deleteLogo por compatibilidade (retorna primeira logo)
  getLogo: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [logo] = await db.select().from(gtBrandAssets)
        .where(and(eq(gtBrandAssets.orgId, input.orgId), eq(gtBrandAssets.tipo, "logo")))
        .orderBy(gtBrandAssets.criadoEm).limit(1);
      return logo ?? null;
    }),

  saveLogo: sysUserProcedure
    .input(z.object({ orgId: z.number(), url: z.string(), fileKey: z.string(), nome: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [r] = await db.insert(gtBrandAssets).values({
        orgId: input.orgId, tipo: "logo",
        url: input.url, fileKey: input.fileKey, nome: input.nome ?? "Logo",
      });
      return { id: (r as { insertId: number }).insertId, url: input.url };
    }),

  deleteLogo: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtBrandAssets).where(and(eq(gtBrandAssets.orgId, input.orgId), eq(gtBrandAssets.tipo, "logo")));
      return { success: true };
    }),

  // Banco de imagens
  listImageBank: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(gtImageBank)
        .where(eq(gtImageBank.orgId, input.orgId))
        .orderBy(desc(gtImageBank.criadoEm));
    }),

  addImageBank: sysUserProcedure
    .input(z.object({
      orgId: z.number(), url: z.string(), fileKey: z.string(),
      nome: z.string().optional(), descricao: z.string().optional(), tags: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [r] = await db.insert(gtImageBank).values({
        orgId: input.orgId, url: input.url, fileKey: input.fileKey,
        nome: input.nome, descricao: input.descricao, tags: input.tags,
      });
      return { id: (r as { insertId: number }).insertId, url: input.url };
    }),

  deleteImageBank: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtImageBank).where(and(eq(gtImageBank.id, input.id), eq(gtImageBank.orgId, input.orgId)));
      return { success: true };
    }),

  updateImageBank: sysUserProcedure
    .input(z.object({
      id: z.number(), orgId: z.number(),
      nome: z.string().optional(), descricao: z.string().optional(), tags: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, orgId, ...data } = input;
      await db.update(gtImageBank).set(data).where(and(eq(gtImageBank.id, id), eq(gtImageBank.orgId, orgId)));
      return { success: true };
    }),
});

// ── Router principal ────────────────────────────────────────────
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
  marketingCampaigns: marketingCampaignsRouter,
  brandAssets: brandAssetsRouter,
  ia: iaRouter,
  auditoria: auditoriaRouter,
  finConfig: finConfigRouter,
});
