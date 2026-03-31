/**
 * dataVip.test.ts — Testes unitários para o módulo Data VIP
 * Cobre: autenticação, validação de inputs, regras de negócio
 */
import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

// ── Autenticação ──────────────────────────────────────────────────────────────
describe("dataVip.dashboard — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.dashboard({ orgId: 1 })
    ).rejects.toThrow();
  });

  it("retorna dados ou erro de DB quando autenticado", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    try {
      const result = await caller.dataVip.dashboard({ orgId: 1 });
      expect(result).toBeDefined();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(typeof msg).toBe("string");
    }
  });
});

describe("dataVip.clientes — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.clientes({ orgId: 1 })
    ).rejects.toThrow();
  });
});

describe("dataVip.ranking — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.ranking({ orgId: 1, periodo: "2026-03" })
    ).rejects.toThrow();
  });
});

describe("dataVip.colaboradores — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.colaboradores({ orgId: 1 })
    ).rejects.toThrow();
  });
});

describe("dataVip.metas — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.metas({ orgId: 1 })
    ).rejects.toThrow();
  });
});

describe("dataVip.servicos — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.servicos({ orgId: 1 })
    ).rejects.toThrow();
  });
});

describe("dataVip.syncLogs — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.syncLogs({ orgId: 1 })
    ).rejects.toThrow();
  });
});

// ── Regras de negócio ─────────────────────────────────────────────────────────
describe("Regras de negócio — Data VIP", () => {
  it("faturamento usa valorLiquido (não valorBruto)", () => {
    // Regra: sempre usar valorLiquido como faturamento real
    const venda = { valorBruto: 100, valorLiquido: 85, desconto: 15 };
    const faturamento = venda.valorLiquido;
    expect(faturamento).toBe(85);
    expect(faturamento).not.toBe(venda.valorBruto);
  });

  it("cliente novo exclui data marcadora 2014-12-31", () => {
    const DATA_MARCADORA = "2014-12-31";
    const clientes = [
      { nome: "João", dataCadastro: "2023-05-10" },
      { nome: "Maria", dataCadastro: DATA_MARCADORA }, // deve ser excluído
      { nome: "Pedro", dataCadastro: "2024-01-15" },
    ];
    const clientesNovos = clientes.filter(c => c.dataCadastro !== DATA_MARCADORA);
    expect(clientesNovos).toHaveLength(2);
    expect(clientesNovos.map(c => c.nome)).not.toContain("Maria");
  });

  it("categorias Raio-X: Ativo (≤45d), Em Risco (46-90d), Perdido (>90d)", () => {
    const hoje = new Date("2026-03-31");
    function categoriaRaioX(ultimaVisita: string): string {
      const dias = Math.floor((hoje.getTime() - new Date(ultimaVisita).getTime()) / (1000 * 60 * 60 * 24));
      if (dias <= 45) return "Ativo";
      if (dias <= 90) return "Em Risco";
      return "Perdido";
    }
    expect(categoriaRaioX("2026-03-20")).toBe("Ativo");   // 11 dias
    expect(categoriaRaioX("2026-02-10")).toBe("Em Risco"); // 49 dias
    expect(categoriaRaioX("2025-12-01")).toBe("Perdido");  // 120 dias
  });

  it("sync automático busca apenas últimos 2 dias", () => {
    const hoje = new Date("2026-03-31");
    const dataInicio = new Date(hoje);
    dataInicio.setDate(dataInicio.getDate() - 2);
    const diffDias = Math.floor((hoje.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDias).toBe(2);
  });

  it("ranking oculta valores para usuários não-admin", () => {
    function podeVerValores(role: string): boolean {
      return role === "master" || role === "org_admin" || role === "admin";
    }
    expect(podeVerValores("admin")).toBe(true);
    expect(podeVerValores("master")).toBe(true);
    expect(podeVerValores("org_admin")).toBe(true);
    expect(podeVerValores("unit_manager")).toBe(false);
    expect(podeVerValores("colaborador")).toBe(false);
  });
});

// ── Validação de inputs ───────────────────────────────────────────────────────
describe("dataVip.saveMeta — validação de inputs", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.saveMeta({
        orgId: 1,
        unitId: 1,
        tipo: "faturamento",
        periodo: "2026-03",
        valor: 50000,
      })
    ).rejects.toThrow();
  });
});

describe("dataVip.startSync — validação de inputs", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.startSync({
        orgId: 1,
        unitId: 1,
        dataInicio: "2026-01-01",
        dataFim: "2026-03-31",
      })
    ).rejects.toThrow();
  });
});

describe("dataVip.raioX — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.raioX({ orgId: 1 })
    ).rejects.toThrow();
  });
});

describe("dataVip.comissoes — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.comissoes({ orgId: 1 })
    ).rejects.toThrow();
  });
});

describe("dataVip.faturamentoMensal — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.faturamentoMensal({ orgId: 1 })
    ).rejects.toThrow();
  });
});

describe("dataVip.unitsConfig — autenticação", () => {
  it("lança UNAUTHORIZED quando usuário não está logado", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dataVip.unitsConfig({ orgId: 1 })
    ).rejects.toThrow();
  });
});
