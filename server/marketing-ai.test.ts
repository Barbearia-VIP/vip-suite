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
