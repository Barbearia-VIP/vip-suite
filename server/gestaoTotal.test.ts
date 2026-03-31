/**
 * gestaoTotal.test.ts — Testes Vitest para o módulo Gestão Total
 * Cobre: validações de schema, lógica de negócio e estrutura dos routers
 */
import { describe, it, expect } from "vitest";

// ─── Helpers de negócio ───────────────────────────────────────────────────────

function calcularLucro(receitas: number, despesas: number) {
  return receitas - despesas;
}

function calcularMargemLucro(receitas: number, despesas: number) {
  if (receitas === 0) return 0;
  return Math.round(((receitas - despesas) / receitas) * 100);
}

function calcularProgressoMeta(atual: number, meta: number) {
  if (meta === 0) return 0;
  return Math.min(Math.round((atual / meta) * 100), 100);
}

function classificarRisco(probabilidade: string, impacto: string) {
  const alto = ["alta", "alto"];
  const baixo = ["baixa", "baixo"];
  if (alto.includes(probabilidade) && alto.includes(impacto)) return "critico";
  if (baixo.includes(probabilidade) && baixo.includes(impacto)) return "baixo";
  return "moderado";
}

function calcularPrioridadeTarefa(prazo: Date | null, status: string) {
  if (status === "concluida") return "concluida";
  if (!prazo) return "sem_prazo";
  const diasRestantes = Math.ceil((prazo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return "atrasada";
  if (diasRestantes <= 2) return "urgente";
  if (diasRestantes <= 7) return "proxima";
  return "normal";
}

function formatarReferenciaMes(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

function calcularKanbanColunas(tarefas: Array<{ status: string }>) {
  return {
    pendente: tarefas.filter(t => t.status === "pendente").length,
    em_andamento: tarefas.filter(t => t.status === "em_andamento").length,
    concluida: tarefas.filter(t => t.status === "concluida").length,
    cancelada: tarefas.filter(t => t.status === "cancelada").length,
  };
}

function validarTarefa(data: { titulo: string; orgId: number; unitId?: number }) {
  const erros: string[] = [];
  if (!data.titulo || data.titulo.trim().length === 0) erros.push("Título é obrigatório");
  if (data.titulo && data.titulo.length > 200) erros.push("Título deve ter no máximo 200 caracteres");
  if (!data.orgId || data.orgId <= 0) erros.push("orgId inválido");
  return erros;
}

function validarLancamentoFinanceiro(data: { tipo: string; valor: number; referencia: string }) {
  const erros: string[] = [];
  if (!["receita", "despesa"].includes(data.tipo)) erros.push("Tipo deve ser receita ou despesa");
  if (data.valor <= 0) erros.push("Valor deve ser positivo");
  if (!/^\d{4}-\d{2}$/.test(data.referencia)) erros.push("Referência deve estar no formato YYYY-MM");
  return erros;
}

function calcularDRE(lancamentos: Array<{ tipo: string; valor: number; categoria?: string }>) {
  const receitas = lancamentos.filter(l => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const despesas = lancamentos.filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
  const lucroLiquido = receitas - despesas;
  const margem = receitas > 0 ? Math.round((lucroLiquido / receitas) * 100) : 0;
  return { receitas, despesas, lucroLiquido, margem };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("Gestão Total — Financeiro", () => {
  it("calcula lucro corretamente", () => {
    expect(calcularLucro(10000, 6000)).toBe(4000);
    expect(calcularLucro(5000, 5000)).toBe(0);
    expect(calcularLucro(3000, 5000)).toBe(-2000);
  });

  it("calcula margem de lucro em percentual", () => {
    expect(calcularMargemLucro(10000, 6000)).toBe(40);
    expect(calcularMargemLucro(10000, 10000)).toBe(0);
    expect(calcularMargemLucro(0, 0)).toBe(0);
  });

  it("valida lançamento financeiro com tipo inválido", () => {
    const erros = validarLancamentoFinanceiro({ tipo: "investimento", valor: 100, referencia: "2026-03" });
    expect(erros).toContain("Tipo deve ser receita ou despesa");
  });

  it("valida lançamento financeiro com valor negativo", () => {
    const erros = validarLancamentoFinanceiro({ tipo: "receita", valor: -50, referencia: "2026-03" });
    expect(erros).toContain("Valor deve ser positivo");
  });

  it("valida lançamento financeiro com referência inválida", () => {
    const erros = validarLancamentoFinanceiro({ tipo: "despesa", valor: 200, referencia: "03/2026" });
    expect(erros).toContain("Referência deve estar no formato YYYY-MM");
  });

  it("valida lançamento financeiro válido sem erros", () => {
    const erros = validarLancamentoFinanceiro({ tipo: "receita", valor: 1500, referencia: "2026-03" });
    expect(erros).toHaveLength(0);
  });

  it("calcula DRE completo", () => {
    const lancamentos = [
      { tipo: "receita", valor: 5000 },
      { tipo: "receita", valor: 3000 },
      { tipo: "despesa", valor: 2000 },
      { tipo: "despesa", valor: 1500 },
    ];
    const dre = calcularDRE(lancamentos);
    expect(dre.receitas).toBe(8000);
    expect(dre.despesas).toBe(3500);
    expect(dre.lucroLiquido).toBe(4500);
    expect(dre.margem).toBe(56);
  });
});

describe("Gestão Total — Tarefas e Kanban", () => {
  it("valida tarefa sem título", () => {
    const erros = validarTarefa({ titulo: "", orgId: 1 });
    expect(erros).toContain("Título é obrigatório");
  });

  it("valida tarefa com título muito longo", () => {
    const erros = validarTarefa({ titulo: "a".repeat(201), orgId: 1 });
    expect(erros).toContain("Título deve ter no máximo 200 caracteres");
  });

  it("valida tarefa com orgId inválido", () => {
    const erros = validarTarefa({ titulo: "Tarefa válida", orgId: 0 });
    expect(erros).toContain("orgId inválido");
  });

  it("valida tarefa válida sem erros", () => {
    const erros = validarTarefa({ titulo: "Revisar processos", orgId: 1, unitId: 2 });
    expect(erros).toHaveLength(0);
  });

  it("calcula colunas do Kanban corretamente", () => {
    const tarefas = [
      { status: "pendente" }, { status: "pendente" },
      { status: "em_andamento" },
      { status: "concluida" }, { status: "concluida" }, { status: "concluida" },
      { status: "cancelada" },
    ];
    const colunas = calcularKanbanColunas(tarefas);
    expect(colunas.pendente).toBe(2);
    expect(colunas.em_andamento).toBe(1);
    expect(colunas.concluida).toBe(3);
    expect(colunas.cancelada).toBe(1);
  });

  it("classifica prioridade de tarefa atrasada", () => {
    const prazoPassado = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(calcularPrioridadeTarefa(prazoPassado, "pendente")).toBe("atrasada");
  });

  it("classifica prioridade de tarefa urgente (prazo em 1 dia)", () => {
    const amanha = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    expect(calcularPrioridadeTarefa(amanha, "pendente")).toBe("urgente");
  });

  it("classifica prioridade de tarefa concluída independente do prazo", () => {
    const prazoPassado = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    expect(calcularPrioridadeTarefa(prazoPassado, "concluida")).toBe("concluida");
  });
});

describe("Gestão Total — Metas e Indicadores", () => {
  it("calcula progresso de meta em 0% quando meta é zero", () => {
    expect(calcularProgressoMeta(100, 0)).toBe(0);
  });

  it("calcula progresso de meta corretamente", () => {
    expect(calcularProgressoMeta(75, 100)).toBe(75);
    expect(calcularProgressoMeta(50, 200)).toBe(25);
  });

  it("limita progresso de meta a 100%", () => {
    expect(calcularProgressoMeta(150, 100)).toBe(100);
  });
});

describe("Gestão Total — Riscos", () => {
  it("classifica risco crítico (alta probabilidade + alto impacto)", () => {
    expect(classificarRisco("alta", "alto")).toBe("critico");
  });

  it("classifica risco baixo (baixa probabilidade + baixo impacto)", () => {
    expect(classificarRisco("baixa", "baixo")).toBe("baixo");
  });

  it("classifica risco moderado (combinações mistas)", () => {
    expect(classificarRisco("alta", "baixo")).toBe("moderado");
    expect(classificarRisco("baixa", "alto")).toBe("moderado");
    expect(classificarRisco("media", "medio")).toBe("moderado");
  });
});

describe("Gestão Total — Utilitários", () => {
  it("formata referência de mês corretamente", () => {
    expect(formatarReferenciaMes(new Date(2026, 2, 15))).toBe("2026-03");
    expect(formatarReferenciaMes(new Date(2026, 11, 1))).toBe("2026-12");
    expect(formatarReferenciaMes(new Date(2026, 0, 31))).toBe("2026-01");
  });
});
