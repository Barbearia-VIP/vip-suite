/**
 * Testes para a lógica de classificação de satisfação do VIP Cam
 * Regras SenseVIP:
 *   1. Se houver QUALQUER "satisfied" → satisfied (permanente)
 *   2. Se neutros >= insatisfeitos → neutral
 *   3. Caso contrário → unsatisfied
 */
import { describe, it, expect } from "vitest";

// ── Helper replicado do servidor ──────────────────────────────────────────────

function calcFinalSatisfactionLevel(
  timeline: Array<{ satisfactionLevel: string }>
): "satisfied" | "neutral" | "unsatisfied" {
  const satisfied = timeline.filter((t) => t.satisfactionLevel === "satisfied").length;
  if (satisfied > 0) return "satisfied";
  const neutral = timeline.filter((t) => t.satisfactionLevel === "neutral").length;
  const unsatisfied = timeline.filter((t) => t.satisfactionLevel === "unsatisfied").length;
  if (neutral >= unsatisfied) return "neutral";
  return "unsatisfied";
}

function buildTimeline(entries: string[]): Array<{ satisfactionLevel: string }> {
  return entries.map((s) => ({ satisfactionLevel: s }));
}

// ── Regra 1: Satisfeito é permanente ─────────────────────────────────────────

describe("Regra 1 — Satisfeito é permanente", () => {
  it("1 captura satisfeita → satisfied", () => {
    expect(calcFinalSatisfactionLevel(buildTimeline(["satisfied"]))).toBe("satisfied");
  });

  it("8 neutras + 1 negativa + 1 satisfeita → satisfied (exemplo do documento)", () => {
    const timeline = buildTimeline([
      "neutral", "neutral", "neutral", "neutral",
      "neutral", "neutral", "neutral", "neutral",
      "unsatisfied", "satisfied",
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("satisfied");
  });

  it("satisfeita no início do histórico → satisfied mesmo com muitas negativas depois", () => {
    const timeline = buildTimeline([
      "satisfied",
      "unsatisfied", "unsatisfied", "unsatisfied", "unsatisfied",
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("satisfied");
  });

  it("satisfeita no meio do histórico → satisfied", () => {
    const timeline = buildTimeline([
      "neutral", "unsatisfied", "satisfied", "neutral", "unsatisfied",
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("satisfied");
  });

  it("múltiplas satisfeitas → satisfied", () => {
    const timeline = buildTimeline(["satisfied", "satisfied", "satisfied"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("satisfied");
  });

  it("todas satisfeitas → satisfied", () => {
    const timeline = buildTimeline(["satisfied", "satisfied", "satisfied", "satisfied"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("satisfied");
  });
});

// ── Regra 2: Neutro prevalece sobre negativo ──────────────────────────────────

describe("Regra 2 — Neutro prevalece sobre negativo", () => {
  it("3 neutras + 2 negativas → neutral (exemplo do documento)", () => {
    const timeline = buildTimeline([
      "neutral", "neutral", "neutral",
      "unsatisfied", "unsatisfied",
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("neutral");
  });

  it("neutros = insatisfeitos → neutral (empate favorece neutro)", () => {
    const timeline = buildTimeline(["neutral", "neutral", "unsatisfied", "unsatisfied"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("neutral");
  });

  it("1 neutra + 1 negativa → neutral (empate)", () => {
    const timeline = buildTimeline(["neutral", "unsatisfied"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("neutral");
  });

  it("apenas neutras → neutral", () => {
    const timeline = buildTimeline(["neutral", "neutral", "neutral"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("neutral");
  });

  it("5 neutras + 0 negativas → neutral", () => {
    const timeline = buildTimeline(["neutral", "neutral", "neutral", "neutral", "neutral"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("neutral");
  });

  it("10 neutras + 9 negativas → neutral", () => {
    const timeline = buildTimeline([
      ...Array(10).fill("neutral"),
      ...Array(9).fill("unsatisfied"),
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("neutral");
  });
});

// ── Regra 3: Negativo só quando maioria absoluta ──────────────────────────────

describe("Regra 3 — Insatisfeito só quando maioria absoluta", () => {
  it("1 neutra + 2 negativas → unsatisfied (exemplo do documento)", () => {
    const timeline = buildTimeline(["neutral", "unsatisfied", "unsatisfied"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("unsatisfied");
  });

  it("1 única captura negativa → unsatisfied (exemplo do documento)", () => {
    const timeline = buildTimeline(["unsatisfied"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("unsatisfied");
  });

  it("apenas negativas → unsatisfied", () => {
    const timeline = buildTimeline(["unsatisfied", "unsatisfied", "unsatisfied"]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("unsatisfied");
  });

  it("0 neutras + 5 negativas → unsatisfied", () => {
    const timeline = buildTimeline(Array(5).fill("unsatisfied"));
    expect(calcFinalSatisfactionLevel(timeline)).toBe("unsatisfied");
  });

  it("2 neutras + 3 negativas → unsatisfied (negativas > neutras)", () => {
    const timeline = buildTimeline([
      "neutral", "neutral",
      "unsatisfied", "unsatisfied", "unsatisfied",
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("unsatisfied");
  });
});

// ── Casos extremos ────────────────────────────────────────────────────────────

describe("Casos extremos", () => {
  it("timeline vazia → neutral (comportamento seguro)", () => {
    // Com 0 satisfied, 0 neutral e 0 unsatisfied: neutral >= unsatisfied (0 >= 0) → neutral
    expect(calcFinalSatisfactionLevel([])).toBe("neutral");
  });

  it("ordem das capturas não importa — satisfeita no final ainda é permanente", () => {
    const timeline = buildTimeline([
      "unsatisfied", "unsatisfied", "unsatisfied", "neutral", "satisfied",
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("satisfied");
  });

  it("histórico muito longo com 1 satisfeita → satisfied", () => {
    const timeline = buildTimeline([
      ...Array(50).fill("neutral"),
      ...Array(49).fill("unsatisfied"),
      "satisfied",
    ]);
    expect(calcFinalSatisfactionLevel(timeline)).toBe("satisfied");
  });

  it("expressão legado: satisfied → 'satisfeito'", () => {
    const level = calcFinalSatisfactionLevel(buildTimeline(["satisfied"]));
    const legado = level === "satisfied" ? "satisfeito" : level === "neutral" ? "neutro" : "insatisfeito";
    expect(legado).toBe("satisfeito");
  });

  it("expressão legado: neutral → 'neutro'", () => {
    const level = calcFinalSatisfactionLevel(buildTimeline(["neutral"]));
    const legado = level === "satisfied" ? "satisfeito" : level === "neutral" ? "neutro" : "insatisfeito";
    expect(legado).toBe("neutro");
  });

  it("expressão legado: unsatisfied → 'insatisfeito'", () => {
    const level = calcFinalSatisfactionLevel(buildTimeline(["unsatisfied"]));
    const legado = level === "satisfied" ? "satisfeito" : level === "neutral" ? "neutro" : "insatisfeito";
    expect(legado).toBe("insatisfeito");
  });
});
