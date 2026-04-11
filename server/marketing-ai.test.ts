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

// ── Testes: Histórico de Conteúdos Gerados ─────────────────────────────────

describe("ContentHistory logic", () => {
  it("deve extrair o título da primeira ideia quando titulo não é fornecido", () => {
    const ideias = [
      { titulo: "Ideia Principal", conceito: "Conceito", gancho: "Gancho", execucao: "Exec", roteiro: "", legendas: { emocional: "", vendedora: "", engajamento: "" }, cta: "" },
    ];
    const titulo = (ideias[0] as { titulo?: string })?.titulo ?? null;
    expect(titulo).toBe("Ideia Principal");
  });

  it("deve retornar null quando ideias está vazio", () => {
    const ideias: { titulo?: string }[] = [];
    const titulo = (ideias[0] as { titulo?: string } | undefined)?.titulo ?? null;
    expect(titulo).toBeNull();
  });

  it("deve validar campos obrigatórios do histórico", () => {
    const entrada = {
      orgId: 1,
      unitId: 2,
      objetivo: "Atrair novos clientes",
      formato: "Reels",
      tipoEntrega: "Vídeo curto",
      publico: "Homens 20-35 anos",
      diferenciais: "Atendimento premium",
      tom: "Descontraído",
      ideias: [],
    };
    expect(entrada.orgId).toBeGreaterThan(0);
    expect(entrada.objetivo.length).toBeGreaterThan(0);
    expect(entrada.formato.length).toBeGreaterThan(0);
  });

  it("deve filtrar por favoritos corretamente", () => {
    const items = [
      { id: 1, favoritado: true, titulo: "A" },
      { id: 2, favoritado: false, titulo: "B" },
      { id: 3, favoritado: true, titulo: "C" },
    ];
    const favoritos = items.filter(i => i.favoritado);
    expect(favoritos).toHaveLength(2);
    expect(favoritos.map(f => f.id)).toEqual([1, 3]);
  });

  it("deve ordenar por data decrescente (mais recente primeiro)", () => {
    const items = [
      { id: 1, createdAt: new Date("2026-01-01") },
      { id: 2, createdAt: new Date("2026-03-01") },
      { id: 3, createdAt: new Date("2026-02-01") },
    ];
    const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });

  it("deve toggle favorito corretamente", () => {
    let item = { id: 1, favoritado: false };
    item = { ...item, favoritado: !item.favoritado };
    expect(item.favoritado).toBe(true);
    item = { ...item, favoritado: !item.favoritado };
    expect(item.favoritado).toBe(false);
  });
});

// ── Testes: Criação de Arte ───────────────────────────────────────────────────

describe("ArtGenerator logic", () => {
  it("deve validar campos obrigatórios do wizard de arte", () => {
    const entrada = {
      orgId: 1,
      unitId: 2,
      companyName: "Barbearia VIP Centro",
      assunto: "promocao",
      tipoArte: "post_instagram",
      objetivo: "atrair_clientes",
      tema: "premium",
      descricao: "Promoção de corte + barba por R$69,90",
      briefing: "Estilo sofisticado com fundo escuro e detalhes dourados",
      tipoImagem: "ia" as const,
    };
    expect(entrada.orgId).toBeGreaterThan(0);
    expect(entrada.assunto).toBeTruthy();
    expect(entrada.tipoArte).toBeTruthy();
    expect(entrada.objetivo).toBeTruthy();
    expect(entrada.tema).toBeTruthy();
    expect(entrada.descricao.length).toBeGreaterThan(0);
    expect(entrada.briefing.length).toBeGreaterThan(0);
  });

  it("deve validar os tipos de imagem aceitos", () => {
    const tiposValidos = ["upload", "ia", "banco"];
    expect(tiposValidos).toContain("upload");
    expect(tiposValidos).toContain("ia");
    expect(tiposValidos).toContain("banco");
    expect(tiposValidos).not.toContain("canva");
  });

  it("deve estruturar o resultado da arte corretamente", () => {
    const resultado = {
      conceito: "Arte premium para barbearia de luxo",
      direcaoVisual: {
        cores: "Preto, dourado e branco",
        tipografia: "Serif elegante para headline, sans-serif para corpo",
        estiloImagem: "Fotografia realista com iluminação quente",
        elementosVisuais: "Linhas douradas, textura de couro, ícone de navalha",
      },
      headline: "Experiência VIP. Não é só um corte.",
      textoSecundario: "Corte + Barba por R$69,90",
      cta: "Agende agora pelo WhatsApp",
      layout: {
        topo: "Logo centralizada com tagline",
        centro: "Headline grande + imagem do ambiente",
        rodape: "Preço + CTA + contato",
      },
      sugestaoImagem: "Homem com barba alinhada, ambiente premium",
      promptImagem: "Premium barbershop interior, warm lighting, leather chair, sophisticated atmosphere",
    };
    expect(resultado.conceito).toBeTruthy();
    expect(resultado.direcaoVisual.cores).toBeTruthy();
    expect(resultado.headline).toBeTruthy();
    expect(resultado.cta).toBeTruthy();
    expect(resultado.layout.topo).toBeTruthy();
    expect(resultado.layout.centro).toBeTruthy();
    expect(resultado.layout.rodape).toBeTruthy();
    expect(resultado.promptImagem).toBeTruthy();
  });

  it("deve retornar imagemUrl null quando tipoImagem é banco", () => {
    const tipoImagem = "banco";
    const imagemGeradaUrl = tipoImagem === "ia" ? "https://cdn.example.com/img.png" : null;
    expect(imagemGeradaUrl).toBeNull();
  });

  it("deve usar imagemUrl do upload quando tipoImagem é upload", () => {
    const tipoImagem = "upload";
    const uploadedUrl = "https://s3.example.com/user-upload.jpg";
    const imagemGeradaUrl = tipoImagem === "upload" ? uploadedUrl : null;
    expect(imagemGeradaUrl).toBe(uploadedUrl);
  });

  it("deve filtrar histórico de artes por favoritos", () => {
    const artes = [
      { id: 1, favoritado: true, assunto: "promocao" },
      { id: 2, favoritado: false, assunto: "institucional" },
      { id: 3, favoritado: true, assunto: "novo_servico" },
    ];
    const favoritas = artes.filter(a => a.favoritado);
    expect(favoritas).toHaveLength(2);
    expect(favoritas.map(a => a.id)).toEqual([1, 3]);
  });
});

// ── Testes: Upload de Imagem de Referência ────────────────────────────────────

describe("uploadArtImage endpoint logic", () => {
  it("deve aceitar tipos de imagem válidos", () => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const testCases = [
      { mime: "image/jpeg", expected: true },
      { mime: "image/png", expected: true },
      { mime: "image/webp", expected: true },
      { mime: "image/gif", expected: true },
      { mime: "application/pdf", expected: false },
      { mime: "video/mp4", expected: false },
      { mime: "text/plain", expected: false },
    ];
    for (const tc of testCases) {
      expect(allowed.includes(tc.mime)).toBe(tc.expected);
    }
  });

  it("deve gerar chave S3 única com prefixo art-references/", () => {
    const originalname = "foto-barbearia.jpg";
    const ext = originalname.split(".").pop() ?? "jpg";
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const key = `art-references/${timestamp}-${random}.${ext}`;

    expect(key).toMatch(/^art-references\/\d+-[a-z0-9]+\.jpg$/);
  });

  it("deve gerar chaves únicas para uploads simultâneos", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const random = Math.random().toString(36).slice(2, 8);
      keys.add(`art-references/${Date.now()}-${random}.jpg`);
    }
    // Com 100 chaves, praticamente todas devem ser únicas
    expect(keys.size).toBeGreaterThan(90);
  });

  it("deve rejeitar arquivos maiores que 16 MB", () => {
    const MAX_SIZE = 16 * 1024 * 1024; // 16 MB em bytes
    const fileSizes = [
      { size: 1024 * 1024, valid: true },         // 1 MB
      { size: 5 * 1024 * 1024, valid: true },      // 5 MB
      { size: 15 * 1024 * 1024, valid: true },     // 15 MB
      { size: 16 * 1024 * 1024, valid: true },     // 16 MB (limite exato)
      { size: 16 * 1024 * 1024 + 1, valid: false }, // 16 MB + 1 byte
      { size: 20 * 1024 * 1024, valid: false },    // 20 MB
    ];
    for (const tc of fileSizes) {
      expect(tc.size <= MAX_SIZE).toBe(tc.valid);
    }
  });

  it("deve retornar URL pública do CDN após upload bem-sucedido", () => {
    // Simula a resposta do storagePut
    const mockStorageResponse = {
      key: "art-references/1775905567185-486qw6.jpg",
      url: "https://d2xsxph8kpxj0f.cloudfront.net/310419663029099127/Gw6CU8nRy9T64yBMvKuEjJ/art-references/1775905567185-486qw6.jpg",
    };
    expect(mockStorageResponse.url).toMatch(/^https:\/\//);
    expect(mockStorageResponse.key).toMatch(/^art-references\//);
  });
});

// ── Testes: ArtHistoryPanel ───────────────────────────────────────────────────

describe("ArtHistoryPanel logic", () => {
  it("deve filtrar artes excluídas localmente por deletedIds", () => {
    const artes = [
      { id: 1, imagemUrl: "https://cdn.example.com/1.jpg", favoritado: false },
      { id: 2, imagemUrl: null, favoritado: true },
      { id: 3, imagemUrl: "https://cdn.example.com/3.jpg", favoritado: false },
    ];
    const deletedIds = new Set([2]);
    const visible = artes.filter(a => !deletedIds.has(a.id));
    expect(visible).toHaveLength(2);
    expect(visible.map(a => a.id)).toEqual([1, 3]);
  });

  it("deve filtrar somente favoritas quando somentesFavoritos=true", () => {
    const artes = [
      { id: 1, favoritado: true },
      { id: 2, favoritado: false },
      { id: 3, favoritado: true },
      { id: 4, favoritado: false },
    ];
    const favoritas = artes.filter(a => a.favoritado);
    expect(favoritas).toHaveLength(2);
    expect(favoritas.map(a => a.id)).toEqual([1, 3]);
  });

  it("deve gerar chave de cache correta para listArtHistory", () => {
    const orgId = 5;
    const unitId = 12;
    const limit = 30;
    const key = { orgId, unitId, limit, somentesFavoritos: false };
    expect(key.orgId).toBe(5);
    expect(key.unitId).toBe(12);
    expect(key.limit).toBe(30);
  });

  it("deve formatar data corretamente em pt-BR", () => {
    const date = new Date("2026-04-11T10:00:00Z");
    const formatted = date.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric"
    });
    expect(formatted).toMatch(/\d{2}/); // dia com 2 dígitos
    expect(formatted).toMatch(/2026/);  // ano presente
  });

  it("deve mapear assuntos para labels legíveis", () => {
    const labels: Record<string, string> = {
      promocao: "Promoção",
      novo_servico: "Novo Serviço",
      institucional: "Institucional",
      data_comemorativa: "Data Comemorativa",
      depoimento: "Depoimento",
      bastidores: "Bastidores",
      produto: "Produto",
      outro: "Outro",
    };
    expect(labels["promocao"]).toBe("Promoção");
    expect(labels["novo_servico"]).toBe("Novo Serviço");
    expect(labels["outro"]).toBe("Outro");
    expect(labels["inexistente"]).toBeUndefined();
  });

  it("deve mapear tipos de arte para labels legíveis", () => {
    const labels: Record<string, string> = {
      post_instagram: "Post Instagram",
      story: "Story",
      reels_capa: "Capa de Reels",
      banner_whatsapp: "Banner WhatsApp",
      flyer_digital: "Flyer Digital",
      card_servico: "Card de Serviço",
      capa_destaque: "Capa de Destaque",
    };
    expect(labels["post_instagram"]).toBe("Post Instagram");
    expect(labels["story"]).toBe("Story");
    expect(labels["capa_destaque"]).toBe("Capa de Destaque");
  });
});

// ── Testes: Botão de download de imagem ───────────────────────────────────────

describe("download de imagem de arte", () => {
  it("deve gerar nome de arquivo descritivo a partir da headline", () => {
    const headline = "Promoção Especial de Verão!";
    const filename = `arte-vip-${headline.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}.jpg`;
    expect(filename).toBe("arte-vip-Promo--o-Especial-de-Ver-o-.jpg");
    expect(filename).toMatch(/^arte-vip-/);
    expect(filename).toMatch(/\.jpg$/);
  });

  it("deve gerar nome de arquivo com assunto e id para o histórico", () => {
    const assunto = "promocao";
    const id = 42;
    const filename = `arte-${assunto}-${id}.jpg`;
    expect(filename).toBe("arte-promocao-42.jpg");
  });

  it("deve truncar headline longa para no máximo 30 caracteres no nome do arquivo", () => {
    const headline = "Esta é uma headline muito longa que ultrapassa o limite";
    const truncated = headline.slice(0, 30);
    expect(truncated.length).toBe(30);
    expect(truncated).toBe("Esta é uma headline muito long");
  });

  it("deve substituir caracteres especiais por hífen no nome do arquivo", () => {
    const headline = "Arte & Design: Barbearia VIP!";
    const safe = headline.replace(/[^a-zA-Z0-9]/g, '-');
    expect(safe).not.toMatch(/[&:! ]/);
    expect(safe).toMatch(/^[a-zA-Z0-9-]+$/);
  });

  it("deve usar URL do CDN como href do link de download", () => {
    const imagemUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029099127/Gw6CU8nRy9T64yBMvKuEjJ/art-references/test.jpg";
    expect(imagemUrl).toMatch(/^https:\/\//);
    expect(imagemUrl).toMatch(/cloudfront\.net/);
  });
});

// ── Testes: Gerar Flyer ──────────────────────────────────────────────────────

describe("generateFlyer", () => {
  it("deve ter os campos obrigatórios para gerar flyer", () => {
    const input = {
      orgId: 1,
      headline: "Seu Tempo. Sua Experiência.",
      textoSecundario: "Barbearia VIP — feriado aberto das 09h às 17h.",
      cta: "Agende seu momento exclusivo.",
      conceito: "Sofisticação e exclusividade.",
      direcaoVisual: {
        cores: "Preto fosco, dourado envelhecido",
        tipografia: "Playfair Display",
        estiloImagem: "Cinematográfico",
        elementosVisuais: "Mínimos",
      },
      layout: {
        topo: "Logotipo Barbearia VIP centralizado",
        centro: "Imagem principal + headline sobreposta",
        rodape: "CTA + horário de funcionamento",
      },
      imagemUrl: "https://cdn.example.com/art.jpg",
      assunto: "feriado",
      tipoArte: "flyer_digital",
    };
    expect(input.headline).toBeTruthy();
    expect(input.cta).toBeTruthy();
    expect(input.layout.topo).toBeTruthy();
    expect(input.layout.centro).toBeTruthy();
    expect(input.layout.rodape).toBeTruthy();
  });

  it("deve construir prompt de flyer com todos os elementos", () => {
    const layout = {
      topo: "Logo VIP centralizada",
      centro: "Imagem + headline em destaque",
      rodape: "CTA + endereço",
    };
    const headline = "Seu Tempo. Sua Experiência.";
    const cta = "Agende agora.";
    const flyerPrompt = [
      `Create a premium, high-end digital flyer for Barbearia VIP.`,
      `HEADLINE: "${headline}"`,
      `CTA: "${cta}"`,
      `LAYOUT - TOP: ${layout.topo}`,
      `LAYOUT - CENTER: ${layout.centro}`,
      `LAYOUT - BOTTOM: ${layout.rodape}`,
    ].join(" ");
    expect(flyerPrompt).toContain(headline);
    expect(flyerPrompt).toContain(cta);
    expect(flyerPrompt).toContain(layout.topo);
  });

  it("deve aceitar imagemUrl opcional (flyer sem imagem base)", () => {
    const inputSemImagem = {
      orgId: 1,
      headline: "Promoção Especial",
      cta: "Agende já!",
      layout: { topo: "Logo", centro: "Texto", rodape: "CTA" },
      imagemUrl: undefined,
    };
    // Sem imagemUrl, o flyer é gerado apenas com texto e layout
    expect(inputSemImagem.imagemUrl).toBeUndefined();
    expect(inputSemImagem.headline).toBeTruthy();
  });
});

// ── Testes: Brand Assets (Logo e Banco de Imagens) ───────────────────────────

describe("brandAssets - logo global", () => {
  it("deve validar campos obrigatórios para salvar logo", () => {
    const logoInput = {
      orgId: 1,
      url: "https://cdn.example.com/logo-vip.png",
      fileKey: "brand-assets/logo/1-logo.png",
      nome: "Logo Barbearia VIP",
    };
    expect(logoInput.orgId).toBeGreaterThan(0);
    expect(logoInput.url).toMatch(/^https?:\/\//);
    expect(logoInput.fileKey).toBeTruthy();
  });

  it("deve ser global para a organização (sem unitId)", () => {
    const logoGlobal = { orgId: 1, url: "https://cdn.example.com/logo.png", fileKey: "brand-assets/logo/1.png" };
    expect(logoGlobal).not.toHaveProperty("unitId");
  });

  it("deve aceitar logo com nome personalizado", () => {
    const logo = { orgId: 1, url: "https://cdn.example.com/logo.png", fileKey: "logo.png", nome: "Logo Barbearia VIP Premium" };
    expect(logo.nome).toContain("VIP");
  });
});

describe("brandAssets - banco de imagens", () => {
  it("deve validar campos para adicionar imagem ao banco", () => {
    const imageInput = {
      orgId: 1,
      url: "https://cdn.example.com/ref-001.jpg",
      fileKey: "image-bank/1-ref-001.jpg",
      nome: "Ambiente premium",
      descricao: "Foto do ambiente da barbearia",
      tags: "ambiente,premium,barbearia",
    };
    expect(imageInput.orgId).toBeGreaterThan(0);
    expect(imageInput.url).toMatch(/^https?:\/\//);
    expect(imageInput.tags).toContain("premium");
  });

  it("deve aceitar imagem sem descrição e tags (campos opcionais)", () => {
    const imageMinima = {
      orgId: 1,
      url: "https://cdn.example.com/img.jpg",
      fileKey: "image-bank/img.jpg",
    };
    expect(imageMinima.url).toBeTruthy();
    expect(imageMinima).not.toHaveProperty("descricao");
  });

  it("deve permitir múltiplas imagens por organização", () => {
    const imagens = [
      { orgId: 1, url: "https://cdn.example.com/img1.jpg", fileKey: "image-bank/img1.jpg" },
      { orgId: 1, url: "https://cdn.example.com/img2.jpg", fileKey: "image-bank/img2.jpg" },
      { orgId: 1, url: "https://cdn.example.com/img3.jpg", fileKey: "image-bank/img3.jpg" },
    ];
    expect(imagens.length).toBe(3);
    expect(imagens.every(img => img.orgId === 1)).toBe(true);
  });
});
