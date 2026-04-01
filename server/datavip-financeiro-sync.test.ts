/**
 * datavip-financeiro-sync.test.ts
 * Testes para a sincronização entre Data VIP e Gestão Total Financeiro
 */
import { describe, it, expect } from "vitest";

// ─── Helpers de negócio (espelham a lógica do vipDataSync.ts) ────────────────

/** Gera a chave de deduplicação usada no campo dataVipRef */
function gerarDataVipRef(unitId: number, dia: string): string {
  return `datavip:${unitId}:${dia}`;
}

/** Valida o formato da chave de deduplicação */
function validarDataVipRef(ref: string): boolean {
  return /^datavip:\d+:\d{4}-\d{2}-\d{2}$/.test(ref);
}

/** Agrega vendas por dia, somando valorLiquido */
function agregarVendasPorDia(
  vendas: Array<{ dataVenda: string; valorLiquido: number; unitId: number }>
): Array<{ dia: string; totalLiquido: number; qtd: number }> {
  const mapa = new Map<string, { totalLiquido: number; qtd: number }>();
  for (const v of vendas) {
    const dia = v.dataVenda.split("T")[0];
    const atual = mapa.get(dia) ?? { totalLiquido: 0, qtd: 0 };
    mapa.set(dia, { totalLiquido: atual.totalLiquido + v.valorLiquido, qtd: atual.qtd + 1 });
  }
  return Array.from(mapa.entries()).map(([dia, { totalLiquido, qtd }]) => ({ dia, totalLiquido, qtd }));
}

/** Gera a descrição do lançamento financeiro */
function gerarDescricaoLancamento(dia: string, qtd: number): string {
  return `Faturamento Data VIP - ${dia} (${qtd} atendimentos)`;
}

/** Calcula a referência mensal (YYYY-MM) a partir de uma data */
function calcularReferenciaMensal(dia: string): string {
  return dia.substring(0, 7);
}

/** Verifica se um lançamento é originado do Data VIP */
function isLancamentoDataVip(lancamento: { dataVipRef: string | null }): boolean {
  return lancamento.dataVipRef !== null && lancamento.dataVipRef.startsWith("datavip:");
}

/** Filtra lançamentos por período */
function filtrarPorPeriodo(
  lancamentos: Array<{ vencimento: string; dataVipRef: string | null }>,
  inicio: string,
  fim: string
): Array<{ vencimento: string; dataVipRef: string | null }> {
  return lancamentos.filter(l => l.vencimento >= inicio && l.vencimento <= fim);
}

/** Calcula o total de receita de lançamentos Data VIP */
function calcularTotalDataVip(
  lancamentos: Array<{ valor: number; dataVipRef: string | null; tipo: string }>
): number {
  return lancamentos
    .filter(l => isLancamentoDataVip(l) && l.tipo === "receita")
    .reduce((s, l) => s + l.valor, 0);
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("Chave de deduplicação (dataVipRef)", () => {
  it("deve gerar chave no formato correto", () => {
    expect(gerarDataVipRef(1, "2026-04-01")).toBe("datavip:1:2026-04-01");
    expect(gerarDataVipRef(42, "2025-12-31")).toBe("datavip:42:2025-12-31");
  });

  it("deve validar chaves no formato correto", () => {
    expect(validarDataVipRef("datavip:1:2026-04-01")).toBe(true);
    expect(validarDataVipRef("datavip:999:2025-01-15")).toBe(true);
  });

  it("deve rejeitar chaves inválidas", () => {
    expect(validarDataVipRef("datavip:abc:2026-04-01")).toBe(false);
    expect(validarDataVipRef("datavip:1:01-04-2026")).toBe(false);
    expect(validarDataVipRef("manual:1:2026-04-01")).toBe(false);
    expect(validarDataVipRef("")).toBe(false);
  });
});

describe("Agregação de vendas por dia", () => {
  const vendas = [
    { dataVenda: "2026-04-01T10:00:00", valorLiquido: 100, unitId: 1 },
    { dataVenda: "2026-04-01T14:00:00", valorLiquido: 200, unitId: 1 },
    { dataVenda: "2026-04-02T09:00:00", valorLiquido: 150, unitId: 1 },
    { dataVenda: "2026-04-02T16:00:00", valorLiquido: 50, unitId: 1 },
    { dataVenda: "2026-04-03T11:00:00", valorLiquido: 300, unitId: 1 },
  ];

  it("deve agregar corretamente por dia", () => {
    const resultado = agregarVendasPorDia(vendas);
    expect(resultado).toHaveLength(3);
    const dia1 = resultado.find(r => r.dia === "2026-04-01");
    expect(dia1?.totalLiquido).toBe(300);
    expect(dia1?.qtd).toBe(2);
  });

  it("deve somar valorLiquido corretamente", () => {
    const resultado = agregarVendasPorDia(vendas);
    const total = resultado.reduce((s, r) => s + r.totalLiquido, 0);
    expect(total).toBe(800);
  });

  it("deve retornar array vazio para vendas vazias", () => {
    expect(agregarVendasPorDia([])).toHaveLength(0);
  });
});

describe("Geração de descrição do lançamento", () => {
  it("deve gerar descrição com dia e quantidade de atendimentos", () => {
    const desc = gerarDescricaoLancamento("2026-04-01", 5);
    expect(desc).toBe("Faturamento Data VIP - 2026-04-01 (5 atendimentos)");
  });

  it("deve funcionar com 1 atendimento", () => {
    const desc = gerarDescricaoLancamento("2026-04-01", 1);
    expect(desc).toContain("1 atendimentos");
  });
});

describe("Referência mensal", () => {
  it("deve extrair YYYY-MM de uma data completa", () => {
    expect(calcularReferenciaMensal("2026-04-01")).toBe("2026-04");
    expect(calcularReferenciaMensal("2025-12-31")).toBe("2025-12");
  });
});

describe("Identificação de lançamentos Data VIP", () => {
  it("deve identificar lançamentos com dataVipRef", () => {
    expect(isLancamentoDataVip({ dataVipRef: "datavip:1:2026-04-01" })).toBe(true);
  });

  it("deve rejeitar lançamentos manuais (dataVipRef null)", () => {
    expect(isLancamentoDataVip({ dataVipRef: null })).toBe(false);
  });
});

describe("Filtro por período", () => {
  const lancamentos = [
    { vencimento: "2026-03-15", dataVipRef: "datavip:1:2026-03-15" },
    { vencimento: "2026-04-01", dataVipRef: "datavip:1:2026-04-01" },
    { vencimento: "2026-04-15", dataVipRef: "datavip:1:2026-04-15" },
    { vencimento: "2026-05-01", dataVipRef: null },
  ];

  it("deve filtrar apenas lançamentos do período informado", () => {
    const resultado = filtrarPorPeriodo(lancamentos, "2026-04-01", "2026-04-30");
    expect(resultado).toHaveLength(2);
    expect(resultado.every(l => l.vencimento >= "2026-04-01" && l.vencimento <= "2026-04-30")).toBe(true);
  });

  it("deve retornar vazio para período sem lançamentos", () => {
    const resultado = filtrarPorPeriodo(lancamentos, "2026-06-01", "2026-06-30");
    expect(resultado).toHaveLength(0);
  });
});

describe("Cálculo de total Data VIP", () => {
  const lancamentos = [
    { valor: 1000, dataVipRef: "datavip:1:2026-04-01", tipo: "receita" },
    { valor: 500, dataVipRef: "datavip:1:2026-04-02", tipo: "receita" },
    { valor: 200, dataVipRef: null, tipo: "receita" }, // manual — não conta
    { valor: 300, dataVipRef: "datavip:1:2026-04-03", tipo: "despesa" }, // despesa — não conta
  ];

  it("deve somar apenas receitas com dataVipRef", () => {
    expect(calcularTotalDataVip(lancamentos)).toBe(1500);
  });

  it("deve retornar 0 para lista vazia", () => {
    expect(calcularTotalDataVip([])).toBe(0);
  });

  it("deve retornar 0 se não houver lançamentos Data VIP", () => {
    const somenteManual = [{ valor: 500, dataVipRef: null, tipo: "receita" }];
    expect(calcularTotalDataVip(somenteManual)).toBe(0);
  });
});

describe("Idempotência da sincronização", () => {
  it("deve gerar a mesma chave para o mesmo dia e unidade", () => {
    const ref1 = gerarDataVipRef(1, "2026-04-01");
    const ref2 = gerarDataVipRef(1, "2026-04-01");
    expect(ref1).toBe(ref2);
  });

  it("deve gerar chaves diferentes para dias diferentes", () => {
    const ref1 = gerarDataVipRef(1, "2026-04-01");
    const ref2 = gerarDataVipRef(1, "2026-04-02");
    expect(ref1).not.toBe(ref2);
  });

  it("deve gerar chaves diferentes para unidades diferentes no mesmo dia", () => {
    const ref1 = gerarDataVipRef(1, "2026-04-01");
    const ref2 = gerarDataVipRef(2, "2026-04-01");
    expect(ref1).not.toBe(ref2);
  });
});
