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
  gtMarketing, gtMarketingCampaigns, gtAdvisorConversations, gtAuditLog,
  gtContentHistory,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

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
        const parsed = parseJsonSafe(content) as Record<string, unknown>;
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

  // Indicadores consolidados do sistema (dados reais)
  consolidado: protectedProcedure
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
        const parsed = parseJsonSafe(content) as Record<string, unknown>;
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

  // Sincroniza faturamento do Data VIP para o Financeiro
  syncDataVip: protectedProcedure
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
  syncDataVipStatus: protectedProcedure
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

/// ── Campanhas de Marketing com IA ────────────────────────────────
const marketingCampaignsRouter = router({
  listCampaigns: protectedProcedure
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

  getCampaign: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(gtMarketingCampaigns)
        .where(and(eq(gtMarketingCampaigns.id, input.id), eq(gtMarketingCampaigns.orgId, input.orgId)))
        .limit(1);
      return rows[0] ?? null;
    }),

  generateCampaign: protectedProcedure
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

  assignCampaign: protectedProcedure
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

  deleteCampaign: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtMarketingCampaigns)
        .where(and(eq(gtMarketingCampaigns.id, input.id), eq(gtMarketingCampaigns.orgId, input.orgId)));
      return { success: true };
    }),

  // ── Histórico de Conteúdos Gerados ──────────────────────────────────────────────
  saveContent: protectedProcedure
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

  listContentHistory: protectedProcedure
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

  toggleContentFavorite: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number(), favoritado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(gtContentHistory)
        .set({ favoritado: input.favoritado })
        .where(and(eq(gtContentHistory.id, input.id), eq(gtContentHistory.orgId, input.orgId)));
      return { success: true };
    }),

  deleteContentHistory: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtContentHistory)
        .where(and(eq(gtContentHistory.id, input.id), eq(gtContentHistory.orgId, input.orgId)));
      return { success: true };
    }),

  // ── Gerador de Conteúdo ──────────────────────────────────────────────────────
  generateContent: protectedProcedure
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
});

// ── IA Conselheiro ────────────────────────────────────────────
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
  marketingCampaigns: marketingCampaignsRouter,
  ia: iaRouter,
  auditoria: auditoriaRouter,
});
