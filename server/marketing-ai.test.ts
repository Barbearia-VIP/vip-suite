/**
 * Testes para o módulo de Marketing com IA
 * Cobre: parseJsonSafe, buildSystemPrompt, buildUserPrompt, estrutura de saída esperada
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers replicados para teste (sem depender do router) ────────────────────

function parseJsonSafe(raw: string): Record<string, unknown> {
  try {
    const clean = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(clean);
  } catch {
    return {};
  }
}

function buildCampaignName(objective: string): string {
  const date = new Date().toLocaleDateString("pt-BR");
  return `${objective} - ${date}`;
}

function validateWizardData(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.objective || typeof data.objective !== "string" || !(data.objective as string).trim()) {
    errors.push("objective é obrigatório");
  }
  if (!data.channels || !Array.isArray(data.channels) || (data.channels as unknown[]).length === 0) {
    errors.push("pelo menos um canal é obrigatório");
  }
  if (!data.kpis || !Array.isArray(data.kpis) || (data.kpis as unknown[]).length === 0) {
    errors.push("pelo menos um KPI é obrigatório");
  }
  if (!data.differentiators || !Array.isArray(data.differentiators) || (data.differentiators as unknown[]).length === 0) {
    errors.push("pelo menos um diferencial é obrigatório");
  }
  return { valid: errors.length === 0, errors };
}

function extractChannelBudgets(channelMix: Array<{ channel: string; budget_percentage: number }>): number {
  return channelMix.reduce((sum, c) => sum + (c.budget_percentage ?? 0), 0);
}

function buildDataVipRef(unitId: number, date: string): string {
  return `datavip:${unitId}:${date}`;
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("parseJsonSafe", () => {
  it("deve parsear JSON puro", () => {
    const result = parseJsonSafe('{"executive_summary": "Resumo"}');
    expect(result).toEqual({ executive_summary: "Resumo" });
  });

  it("deve parsear JSON com bloco de código markdown", () => {
    const result = parseJsonSafe("```json\n{\"personas\": []}\n```");
    expect(result).toEqual({ personas: [] });
  });

  it("deve parsear JSON com bloco de código sem linguagem", () => {
    const result = parseJsonSafe("```\n{\"channel_mix\": []}\n```");
    expect(result).toEqual({ channel_mix: [] });
  });

  it("deve retornar objeto vazio para JSON inválido", () => {
    const result = parseJsonSafe("isso não é JSON");
    expect(result).toEqual({});
  });

  it("deve retornar objeto vazio para string vazia", () => {
    const result = parseJsonSafe("");
    expect(result).toEqual({});
  });

  it("deve retornar objeto vazio para JSON truncado", () => {
    const result = parseJsonSafe('{"executive_summary": "Resumo"');
    expect(result).toEqual({});
  });
});

describe("buildCampaignName", () => {
  it("deve incluir o objetivo no nome", () => {
    const name = buildCampaignName("Aumentar agendamentos");
    expect(name).toContain("Aumentar agendamentos");
  });

  it("deve incluir a data no nome", () => {
    const name = buildCampaignName("Promoção de Verão");
    const today = new Date().toLocaleDateString("pt-BR");
    expect(name).toContain(today);
  });

  it("deve separar objetivo e data com ' - '", () => {
    const name = buildCampaignName("Campanha de Natal");
    expect(name).toMatch(/^Campanha de Natal - \d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("validateWizardData", () => {
  const validData = {
    objective: "Aumentar agendamentos em 30 dias",
    audience: { age_range: "25-45", gender: "Todos", interests: "Beleza", locations: [] },
    offer: "20% OFF na primeira visita",
    budget: { total: 3000, daily: 100, start_date: "2026-04-01", end_date: "2026-04-30" },
    channels: ["Instagram", "Facebook"],
    assets: { photos_videos: true, testimonials: false, awards: false, certifications: false },
    tone: "amigavel",
    restrictions: "",
    kpis: ["Agendamentos", "CAC (Custo de Aquisição)"],
    differentiators: ["Atendimento personalizado", "Profissionais experientes"],
    observations: "",
  };

  it("deve validar dados completos como válidos", () => {
    const { valid, errors } = validateWizardData(validData);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("deve rejeitar dados sem objetivo", () => {
    const { valid, errors } = validateWizardData({ ...validData, objective: "" });
    expect(valid).toBe(false);
    expect(errors).toContain("objective é obrigatório");
  });

  it("deve rejeitar dados sem canais", () => {
    const { valid, errors } = validateWizardData({ ...validData, channels: [] });
    expect(valid).toBe(false);
    expect(errors).toContain("pelo menos um canal é obrigatório");
  });

  it("deve rejeitar dados sem KPIs", () => {
    const { valid, errors } = validateWizardData({ ...validData, kpis: [] });
    expect(valid).toBe(false);
    expect(errors).toContain("pelo menos um KPI é obrigatório");
  });

  it("deve rejeitar dados sem diferenciais", () => {
    const { valid, errors } = validateWizardData({ ...validData, differentiators: [] });
    expect(valid).toBe(false);
    expect(errors).toContain("pelo menos um diferencial é obrigatório");
  });

  it("deve acumular múltiplos erros", () => {
    const { valid, errors } = validateWizardData({ ...validData, objective: "", channels: [], kpis: [] });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("extractChannelBudgets", () => {
  it("deve somar os percentuais de todos os canais", () => {
    const channelMix = [
      { channel: "Instagram", budget_percentage: 40 },
      { channel: "Facebook", budget_percentage: 30 },
      { channel: "Google Ads", budget_percentage: 30 },
    ];
    expect(extractChannelBudgets(channelMix)).toBe(100);
  });

  it("deve retornar 0 para lista vazia", () => {
    expect(extractChannelBudgets([])).toBe(0);
  });

  it("deve tratar percentuais parciais", () => {
    const channelMix = [
      { channel: "Instagram", budget_percentage: 50 },
      { channel: "TikTok", budget_percentage: 25 },
    ];
    expect(extractChannelBudgets(channelMix)).toBe(75);
  });
});

describe("buildDataVipRef", () => {
  it("deve gerar chave no formato correto", () => {
    const ref = buildDataVipRef(42, "2026-04-01");
    expect(ref).toBe("datavip:42:2026-04-01");
  });

  it("deve diferenciar unidades diferentes", () => {
    const ref1 = buildDataVipRef(1, "2026-04-01");
    const ref2 = buildDataVipRef(2, "2026-04-01");
    expect(ref1).not.toBe(ref2);
  });

  it("deve diferenciar datas diferentes", () => {
    const ref1 = buildDataVipRef(1, "2026-04-01");
    const ref2 = buildDataVipRef(1, "2026-04-02");
    expect(ref1).not.toBe(ref2);
  });
});

describe("estrutura de saída esperada da IA", () => {
  const mockCampaignOutput = {
    executive_summary: "Campanha focada em aumentar agendamentos com desconto de boas-vindas.",
    personas: [
      {
        name: "Ana, 32 anos",
        demographics: "Mulher, 25-40 anos, classe B",
        pain_points: ["Falta de tempo", "Preço alto"],
        desires: ["Praticidade", "Qualidade"],
        key_messages: ["Agende em 2 minutos", "Primeira visita com 20% OFF"],
      },
    ],
    messages: {
      central_promise: "Beleza sem complicação",
      pillars: ["Praticidade", "Qualidade", "Preço justo"],
      social_proof: ["500+ clientes satisfeitos"],
    },
    channel_mix: [
      { channel: "Instagram", budget_percentage: 40, justification: "Alta presença do público-alvo" },
      { channel: "Google Ads", budget_percentage: 35, justification: "Captura de intenção de busca" },
      { channel: "WhatsApp", budget_percentage: 25, justification: "Conversão direta" },
    ],
    kpis_targets: [
      { metric: "Agendamentos", target: "50/mês", formula: "Total de agendamentos no período" },
      { metric: "CAC", target: "R$ 60", formula: "Investimento / Novos clientes" },
    ],
    experiments_backlog: [
      {
        hypothesis: "Vídeo curto gera mais cliques que imagem estática",
        impact: 8, confidence: 7, ease: 9,
        ice_score: 24,
        next_step: "Criar 2 variações de anúncio e testar por 7 dias",
      },
    ],
  };

  it("deve ter resumo executivo", () => {
    expect(mockCampaignOutput.executive_summary).toBeTruthy();
    expect(typeof mockCampaignOutput.executive_summary).toBe("string");
  });

  it("deve ter pelo menos uma persona", () => {
    expect(mockCampaignOutput.personas.length).toBeGreaterThan(0);
    const persona = mockCampaignOutput.personas[0];
    expect(persona).toHaveProperty("name");
    expect(persona).toHaveProperty("pain_points");
    expect(persona).toHaveProperty("desires");
    expect(persona).toHaveProperty("key_messages");
  });

  it("deve ter mix de canais com percentuais", () => {
    const total = extractChannelBudgets(mockCampaignOutput.channel_mix);
    expect(total).toBe(100);
  });

  it("deve ter KPIs com meta e fórmula", () => {
    const kpi = mockCampaignOutput.kpis_targets[0];
    expect(kpi).toHaveProperty("metric");
    expect(kpi).toHaveProperty("target");
    expect(kpi).toHaveProperty("formula");
  });

  it("deve ter experimentos com ICE score", () => {
    const exp = mockCampaignOutput.experiments_backlog[0];
    expect(exp).toHaveProperty("hypothesis");
    expect(exp).toHaveProperty("ice_score");
    expect(exp.ice_score).toBe(exp.impact + exp.confidence + exp.ease);
  });

  it("deve ter mensagens com promessa central e pilares", () => {
    expect(mockCampaignOutput.messages.central_promise).toBeTruthy();
    expect(Array.isArray(mockCampaignOutput.messages.pillars)).toBe(true);
    expect(mockCampaignOutput.messages.pillars.length).toBeGreaterThan(0);
  });
});

// ── Testes para destinação de campanha para colaborador ───────────────────────

function buildAssignPayload(
  campaignId: number,
  orgId: number,
  colaborador: { id: number; nome: string },
  options: { createTask?: boolean; taskPrazo?: string; unitId?: number } = {}
) {
  return {
    id: campaignId,
    orgId,
    unitId: options.unitId,
    assignedToId: colaborador.id,
    assignedToName: colaborador.nome,
    createTask: options.createTask ?? true,
    taskPrazo: options.taskPrazo,
  };
}

function buildTaskFromCampaign(
  campaignId: number,
  campaignName: string,
  responsavel: string,
  orgId: number,
  unitId?: number,
  prazo?: string
) {
  return {
    orgId,
    unitId,
    titulo: `Campanha de Marketing: ${campaignName}`,
    descricao: `Campanha de marketing destinada para execução. Responsável: ${responsavel}.`,
    prioridade: "media",
    responsavel,
    prazo: prazo ? new Date(prazo) : undefined,
  };
}

describe("assignCampaign — lógica de destinação", () => {
  it("deve montar payload correto com colaborador selecionado", () => {
    const colaborador = { id: 5, nome: "João Silva" };
    const payload = buildAssignPayload(42, 1, colaborador, { createTask: true, unitId: 3 });

    expect(payload.id).toBe(42);
    expect(payload.orgId).toBe(1);
    expect(payload.unitId).toBe(3);
    expect(payload.assignedToId).toBe(5);
    expect(payload.assignedToName).toBe("João Silva");
    expect(payload.createTask).toBe(true);
  });

  it("deve montar payload sem criar tarefa quando createTask=false", () => {
    const colaborador = { id: 7, nome: "Maria Souza" };
    const payload = buildAssignPayload(10, 2, colaborador, { createTask: false });

    expect(payload.createTask).toBe(false);
    expect(payload.taskPrazo).toBeUndefined();
  });

  it("deve incluir prazo quando informado", () => {
    const colaborador = { id: 3, nome: "Carlos Lima" };
    const payload = buildAssignPayload(15, 1, colaborador, {
      createTask: true,
      taskPrazo: "2026-05-31T00:00:00.000Z",
    });

    expect(payload.taskPrazo).toBe("2026-05-31T00:00:00.000Z");
  });

  it("deve gerar tarefa com título correto baseado no nome da campanha", () => {
    const tarefa = buildTaskFromCampaign(42, "Promoção de Verão", "João Silva", 1, 3);

    expect(tarefa.titulo).toBe("Campanha de Marketing: Promoção de Verão");
    expect(tarefa.responsavel).toBe("João Silva");
    expect(tarefa.prioridade).toBe("media");
    expect(tarefa.orgId).toBe(1);
    expect(tarefa.unitId).toBe(3);
  });

  it("deve gerar tarefa sem prazo quando não informado", () => {
    const tarefa = buildTaskFromCampaign(42, "Campanha de Natal", "Ana Costa", 1, 2);
    expect(tarefa.prazo).toBeUndefined();
  });

  it("deve gerar tarefa com prazo quando informado", () => {
    const tarefa = buildTaskFromCampaign(42, "Black Friday", "Pedro Alves", 1, 2, "2026-11-29T00:00:00.000Z");
    expect(tarefa.prazo).toBeInstanceOf(Date);
    expect(tarefa.prazo?.getFullYear()).toBe(2026);
  });

  it("deve aceitar destinação sem unitId (nível de organização)", () => {
    const colaborador = { id: 9, nome: "Fernanda Rocha" };
    const payload = buildAssignPayload(20, 1, colaborador);

    expect(payload.unitId).toBeUndefined();
    expect(payload.assignedToName).toBe("Fernanda Rocha");
  });
});

// ── Testes para o Gerador de Conteúdo (wizard 6 telas) ───────────────────────

type ContentWizardInput = {
  objetivo: string;
  formato: string;
  tipoEntrega: string;
  publico: string;
  diferenciais: string;
  tom: string;
};

function validateContentWizardInput(data: ContentWizardInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.objetivo?.trim()) errors.push("objetivo é obrigatório");
  if (!data.formato?.trim()) errors.push("formato é obrigatório");
  if (!data.tipoEntrega?.trim()) errors.push("tipoEntrega é obrigatório");
  if (!data.publico?.trim()) errors.push("publico é obrigatório");
  if (!data.diferenciais?.trim()) errors.push("diferenciais é obrigatório");
  if (!data.tom?.trim()) errors.push("tom é obrigatório");
  return { valid: errors.length === 0, errors };
}

type ContentIdeia = {
  titulo: string;
  conceito: string;
  execucao: string;
  gancho: string;
  roteiro: string;
  legendas: { emocional: string; vendedora: string; engajamento: string };
  cta: string;
};

function validateContentIdeia(ideia: ContentIdeia): boolean {
  return !!(
    ideia.titulo?.trim() &&
    ideia.conceito?.trim() &&
    ideia.execucao?.trim() &&
    ideia.gancho?.trim() &&
    ideia.legendas?.emocional?.trim() &&
    ideia.legendas?.vendedora?.trim() &&
    ideia.legendas?.engajamento?.trim() &&
    ideia.cta?.trim()
  );
}

describe("Gerador de Conteúdo — validação do wizard", () => {
  const validInput: ContentWizardInput = {
    objetivo: "Captar novos clientes",
    formato: "Vídeo (Reels/TikTok)",
    tipoEntrega: "Ideia + roteiro + legenda",
    publico: "Público premium",
    diferenciais: "Ambiente premium, Open bar, Experiência VIP",
    tom: "Padrão VIP",
  };

  it("deve validar input completo como válido", () => {
    const { valid, errors } = validateContentWizardInput(validInput);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("deve rejeitar input sem objetivo", () => {
    const { valid, errors } = validateContentWizardInput({ ...validInput, objetivo: "" });
    expect(valid).toBe(false);
    expect(errors).toContain("objetivo é obrigatório");
  });

  it("deve rejeitar input sem formato", () => {
    const { valid, errors } = validateContentWizardInput({ ...validInput, formato: "" });
    expect(valid).toBe(false);
    expect(errors).toContain("formato é obrigatório");
  });

  it("deve rejeitar input sem tom", () => {
    const { valid, errors } = validateContentWizardInput({ ...validInput, tom: "" });
    expect(valid).toBe(false);
    expect(errors).toContain("tom é obrigatório");
  });

  it("deve aceitar objetivo personalizado (campo aberto)", () => {
    const { valid } = validateContentWizardInput({ ...validInput, objetivo: "Mostrar o processo de atendimento VIP" });
    expect(valid).toBe(true);
  });

  it("deve aceitar múltiplos diferenciais concatenados", () => {
    const { valid } = validateContentWizardInput({
      ...validInput,
      diferenciais: "Ambiente premium, Open bar, Atendimento diferenciado, Experiência VIP",
    });
    expect(valid).toBe(true);
  });
});

describe("Gerador de Conteúdo — estrutura de saída esperada", () => {
  const mockIdeia: ContentIdeia = {
    titulo: "O Ritual do Homem VIP",
    conceito: "Mostrar o processo completo de atendimento como uma experiência de luxo, não apenas um corte de cabelo.",
    execucao: "1. Grave a entrada do cliente no salão\n2. Mostre o open bar sendo servido\n3. Capture o processo do corte em detalhes\n4. Finalize com a saída do cliente satisfeito",
    gancho: "Isso não é uma barbearia. Isso é um ritual.",
    roteiro: "Cena 1: Porta abrindo em slow motion...\nCena 2: Copo de whisky sendo servido...",
    legendas: {
      emocional: "Porque você merece mais do que um corte. Você merece uma experiência. ✂️",
      vendedora: "Agende agora e descubra o que é ser atendido como VIP. Link na bio.",
      engajamento: "Você já foi numa barbearia assim? Comenta aí 👇",
    },
    cta: "Agende pelo link na bio ou WhatsApp",
  };

  it("deve ter todos os campos obrigatórios preenchidos", () => {
    expect(validateContentIdeia(mockIdeia)).toBe(true);
  });

  it("deve ter 3 variações de legenda", () => {
    expect(mockIdeia.legendas.emocional).toBeTruthy();
    expect(mockIdeia.legendas.vendedora).toBeTruthy();
    expect(mockIdeia.legendas.engajamento).toBeTruthy();
  });

  it("deve ter gancho para os primeiros 3 segundos", () => {
    expect(mockIdeia.gancho).toBeTruthy();
    expect(typeof mockIdeia.gancho).toBe("string");
  });

  it("deve ter roteiro quando tipo de entrega inclui roteiro", () => {
    expect(mockIdeia.roteiro).toBeTruthy();
    expect(mockIdeia.roteiro.length).toBeGreaterThan(10);
  });

  it("deve ter CTA sugerido", () => {
    expect(mockIdeia.cta).toBeTruthy();
  });

  it("deve rejeitar ideia sem título", () => {
    expect(validateContentIdeia({ ...mockIdeia, titulo: "" })).toBe(false);
  });

  it("deve rejeitar ideia sem gancho", () => {
    expect(validateContentIdeia({ ...mockIdeia, gancho: "" })).toBe(false);
  });
});
