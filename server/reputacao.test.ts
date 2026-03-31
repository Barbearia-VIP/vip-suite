import { describe, it, expect } from "vitest";

// ─── Helpers de negócio ────────────────────────────────────────────────────

function calcularMediaAvaliacoes(notas: number[]): number {
  if (notas.length === 0) return 0;
  return notas.reduce((a, b) => a + b, 0) / notas.length;
}

function classificarSentimento(nota: number): "positivo" | "neutro" | "negativo" {
  if (nota >= 4) return "positivo";
  if (nota === 3) return "neutro";
  return "negativo";
}

function calcularTaxaResposta(total: number, respondidas: number): number {
  if (total === 0) return 0;
  return Math.round((respondidas / total) * 100);
}

function gerarPromptResposta(
  nota: number,
  texto: string,
  nomeEstabelecimento: string,
  tom: "formal" | "casual" | "amigavel"
): string {
  const sentimento = classificarSentimento(nota);
  const abertura = tom === "formal"
    ? "Prezado cliente,"
    : tom === "casual"
    ? "Olá!"
    : "Olá, obrigado pelo seu contato!";

  return `${abertura} Avaliação ${nota}/5 (${sentimento}): "${texto.slice(0, 50)}..." — ${nomeEstabelecimento}`;
}

function filtrarAvaliacoesSemResposta(
  avaliacoes: Array<{ id: number; respondida: boolean }>
): Array<{ id: number; respondida: boolean }> {
  return avaliacoes.filter((a) => !a.respondida);
}

function calcularDistribuicaoNotas(
  avaliacoes: Array<{ nota: number }>
): Record<number, number> {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of avaliacoes) {
    if (a.nota >= 1 && a.nota <= 5) dist[a.nota]++;
  }
  return dist;
}

function validarPlaceId(placeId: string): boolean {
  return placeId.startsWith("ChIJ") && placeId.length > 10;
}

function sanitizarTextoResposta(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").slice(0, 4096);
}

function calcularNPS(avaliacoes: Array<{ nota: number }>): number {
  if (avaliacoes.length === 0) return 0;
  const promotores = avaliacoes.filter((a) => a.nota === 5).length;
  const detratores = avaliacoes.filter((a) => a.nota <= 2).length;
  return Math.round(((promotores - detratores) / avaliacoes.length) * 100);
}

function agruparPorPlataforma(
  avaliacoes: Array<{ plataforma: string; nota: number }>
): Record<string, { total: number; media: number }> {
  const grupos: Record<string, number[]> = {};
  for (const a of avaliacoes) {
    if (!grupos[a.plataforma]) grupos[a.plataforma] = [];
    grupos[a.plataforma].push(a.nota);
  }
  const resultado: Record<string, { total: number; media: number }> = {};
  for (const [plataforma, notas] of Object.entries(grupos)) {
    resultado[plataforma] = {
      total: notas.length,
      media: calcularMediaAvaliacoes(notas),
    };
  }
  return resultado;
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe("Reputação — Cálculos de Métricas", () => {
  it("calcula média corretamente com notas variadas", () => {
    expect(calcularMediaAvaliacoes([5, 4, 3, 2, 1])).toBe(3);
    expect(calcularMediaAvaliacoes([5, 5, 5])).toBe(5);
    expect(calcularMediaAvaliacoes([])).toBe(0);
  });

  it("calcula média com decimais", () => {
    const media = calcularMediaAvaliacoes([4, 5, 4]);
    expect(media).toBeCloseTo(4.33, 1);
  });

  it("classifica sentimento corretamente", () => {
    expect(classificarSentimento(5)).toBe("positivo");
    expect(classificarSentimento(4)).toBe("positivo");
    expect(classificarSentimento(3)).toBe("neutro");
    expect(classificarSentimento(2)).toBe("negativo");
    expect(classificarSentimento(1)).toBe("negativo");
  });

  it("calcula taxa de resposta corretamente", () => {
    expect(calcularTaxaResposta(100, 75)).toBe(75);
    expect(calcularTaxaResposta(10, 10)).toBe(100);
    expect(calcularTaxaResposta(0, 0)).toBe(0);
    expect(calcularTaxaResposta(3, 1)).toBe(33);
  });

  it("calcula NPS corretamente", () => {
    const avaliacoes = [
      { nota: 5 }, { nota: 5 }, { nota: 5 },
      { nota: 3 },
      { nota: 1 }, { nota: 2 },
    ];
    // promotores=3, detratores=2, total=6 → (3-2)/6 * 100 = 16.67 → 17
    expect(calcularNPS(avaliacoes)).toBe(17);
    expect(calcularNPS([])).toBe(0);
  });
});

describe("Reputação — Distribuição de Notas", () => {
  it("distribui notas corretamente", () => {
    const avaliacoes = [
      { nota: 5 }, { nota: 5 }, { nota: 4 },
      { nota: 3 }, { nota: 1 },
    ];
    const dist = calcularDistribuicaoNotas(avaliacoes);
    expect(dist[5]).toBe(2);
    expect(dist[4]).toBe(1);
    expect(dist[3]).toBe(1);
    expect(dist[2]).toBe(0);
    expect(dist[1]).toBe(1);
  });

  it("ignora notas fora do intervalo 1-5", () => {
    const avaliacoes = [{ nota: 0 }, { nota: 6 }, { nota: 5 }];
    const dist = calcularDistribuicaoNotas(avaliacoes);
    expect(dist[5]).toBe(1);
    expect(Object.values(dist).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("Reputação — Filtragem e Agrupamento", () => {
  it("filtra avaliações sem resposta corretamente", () => {
    const avaliacoes = [
      { id: 1, respondida: true },
      { id: 2, respondida: false },
      { id: 3, respondida: false },
    ];
    const semResposta = filtrarAvaliacoesSemResposta(avaliacoes);
    expect(semResposta).toHaveLength(2);
    expect(semResposta.map((a) => a.id)).toEqual([2, 3]);
  });

  it("agrupa avaliações por plataforma", () => {
    const avaliacoes = [
      { plataforma: "google", nota: 5 },
      { plataforma: "google", nota: 4 },
      { plataforma: "ifood", nota: 3 },
    ];
    const grupos = agruparPorPlataforma(avaliacoes);
    expect(grupos.google.total).toBe(2);
    expect(grupos.google.media).toBe(4.5);
    expect(grupos.ifood.total).toBe(1);
    expect(grupos.ifood.media).toBe(3);
  });
});

describe("Reputação — Validações", () => {
  it("valida Place ID do Google corretamente", () => {
    expect(validarPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(true);
    expect(validarPlaceId("ChIJ")).toBe(false);
    expect(validarPlaceId("invalid-id")).toBe(false);
    expect(validarPlaceId("")).toBe(false);
  });

  it("sanitiza texto de resposta corretamente", () => {
    expect(sanitizarTextoResposta("  Obrigado!  ")).toBe("Obrigado!");
    expect(sanitizarTextoResposta("Texto  com   espaços")).toBe("Texto com espaços");
    const textoLongo = "a".repeat(5000);
    expect(sanitizarTextoResposta(textoLongo)).toHaveLength(4096);
  });
});

describe("Reputação — Geração de Prompt IA", () => {
  it("gera prompt com tom formal", () => {
    const prompt = gerarPromptResposta(5, "Excelente serviço!", "Barbearia VIP", "formal");
    expect(prompt).toContain("Prezado cliente");
    expect(prompt).toContain("positivo");
    expect(prompt).toContain("Barbearia VIP");
  });

  it("gera prompt com tom casual", () => {
    const prompt = gerarPromptResposta(2, "Serviço ruim", "Barbearia VIP", "casual");
    expect(prompt).toContain("Olá!");
    expect(prompt).toContain("negativo");
  });

  it("gera prompt com tom amigável", () => {
    const prompt = gerarPromptResposta(3, "Serviço ok", "Barbearia VIP", "amigavel");
    expect(prompt).toContain("obrigado");
    expect(prompt).toContain("neutro");
  });

  it("trunca texto longo no prompt", () => {
    const textoLongo = "a".repeat(200);
    const prompt = gerarPromptResposta(4, textoLongo, "VIP", "formal");
    // O texto deve ser truncado em 50 chars + "..."
    expect(prompt).toContain("...");
  });
});

describe("Reputação — Regras de Negócio Multi-Unidade", () => {
  it("dados de avaliação são isolados por unidade", () => {
    const avaliacoesUnidade1 = [{ id: 1, unitId: 1, nota: 5 }];
    const avaliacoesUnidade2 = [{ id: 2, unitId: 2, nota: 2 }];

    const filtrarPorUnidade = (avs: typeof avaliacoesUnidade1, unitId: number) =>
      avs.filter((a) => a.unitId === unitId);

    expect(filtrarPorUnidade([...avaliacoesUnidade1, ...avaliacoesUnidade2], 1)).toHaveLength(1);
    expect(filtrarPorUnidade([...avaliacoesUnidade1, ...avaliacoesUnidade2], 2)).toHaveLength(1);
  });

  it("admin vê todas as unidades, usuário comum vê apenas a sua", () => {
    const avaliacoes = [
      { id: 1, unitId: 1, nota: 5 },
      { id: 2, unitId: 2, nota: 3 },
      { id: 3, unitId: 3, nota: 4 },
    ];

    const filtrarParaUsuario = (
      avs: typeof avaliacoes,
      role: "admin" | "user",
      unitId?: number
    ) => {
      if (role === "admin") return avs;
      return avs.filter((a) => a.unitId === unitId);
    };

    expect(filtrarParaUsuario(avaliacoes, "admin")).toHaveLength(3);
    expect(filtrarParaUsuario(avaliacoes, "user", 1)).toHaveLength(1);
    expect(filtrarParaUsuario(avaliacoes, "user", 2)).toHaveLength(1);
  });
});
