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

// ── Testes de classifyExpression com novos thresholds ────────────────────────
// Replicamos a função aqui para testar de forma isolada (sem importar o módulo client)

function classifyExpression(scores: {
  happy: number; neutral: number; angry: number;
  surprised: number; sad: number; disgusted: number; fearful: number;
}): "satisfied" | "neutral" | "unsatisfied" {
  // Thresholds calibrados para o modelo @vladmandic/face-api
  if (scores.angry >= 0.55 || scores.disgusted >= 0.50 || (scores.sad >= 0.60 && scores.happy < 0.15)) {
    return "unsatisfied";
  }
  if (scores.happy >= 0.35) return "satisfied";
  return "neutral";
}

const BASE = { happy: 0, neutral: 0, angry: 0, surprised: 0, sad: 0, disgusted: 0, fearful: 0 };

describe("classifyExpression — thresholds calibrados (anti falsos positivos)", () => {
  // Rosto neutro-sério: angry baixo não deve classificar como insatisfeito
  it("angry=0.30 (rosto sério) → neutral, não insatisfeito", () => {
    expect(classifyExpression({ ...BASE, neutral: 0.55, angry: 0.30 })).toBe("neutral");
  });

  it("angry=0.40 (expressão séria) → neutral, não insatisfeito", () => {
    expect(classifyExpression({ ...BASE, neutral: 0.45, angry: 0.40 })).toBe("neutral");
  });

  it("angry=0.54 (limiar) → neutral", () => {
    expect(classifyExpression({ ...BASE, neutral: 0.40, angry: 0.54 })).toBe("neutral");
  });

  it("angry=0.55 (raiva clara) → unsatisfied", () => {
    expect(classifyExpression({ ...BASE, angry: 0.55 })).toBe("unsatisfied");
  });

  it("angry=0.80 (raiva forte) → unsatisfied", () => {
    expect(classifyExpression({ ...BASE, angry: 0.80 })).toBe("unsatisfied");
  });

  // disgusted
  it("disgusted=0.30 (concentrado) → neutral, não insatisfeito", () => {
    expect(classifyExpression({ ...BASE, neutral: 0.60, disgusted: 0.30 })).toBe("neutral");
  });

  it("disgusted=0.50 → unsatisfied", () => {
    expect(classifyExpression({ ...BASE, disgusted: 0.50 })).toBe("unsatisfied");
  });

  // sad
  it("sad=0.40 (rosto cansado) → neutral, não insatisfeito", () => {
    expect(classifyExpression({ ...BASE, neutral: 0.50, sad: 0.40 })).toBe("neutral");
  });

  it("sad=0.60 + happy=0.20 (happy acima do limite) → neutral", () => {
    expect(classifyExpression({ ...BASE, sad: 0.60, happy: 0.20 })).toBe("neutral");
  });

  it("sad=0.60 + happy=0.10 → unsatisfied", () => {
    expect(classifyExpression({ ...BASE, sad: 0.60, happy: 0.10 })).toBe("unsatisfied");
  });

  // happy
  it("happy=0.35 (sorriso leve) → satisfied", () => {
    expect(classifyExpression({ ...BASE, happy: 0.35 })).toBe("satisfied");
  });

  it("happy=0.34 (abaixo do threshold) → neutral", () => {
    expect(classifyExpression({ ...BASE, neutral: 0.60, happy: 0.34 })).toBe("neutral");
  });

  it("happy=0.80 (sorriso amplo) → satisfied", () => {
    expect(classifyExpression({ ...BASE, happy: 0.80 })).toBe("satisfied");
  });

  // Rosto completamente neutro (como em barbearia)
  it("rosto neutro típico (neutral dominante) → neutral", () => {
    expect(classifyExpression({ happy: 0.05, neutral: 0.70, angry: 0.10, surprised: 0.05, sad: 0.05, disgusted: 0.03, fearful: 0.02 })).toBe("neutral");
  });

  // Rosto sério mas não irritado (common em barbearia)
  it("rosto sério com angry=0.25 e sad=0.20 → neutral", () => {
    expect(classifyExpression({ happy: 0.05, neutral: 0.45, angry: 0.25, surprised: 0.02, sad: 0.20, disgusted: 0.02, fearful: 0.01 })).toBe("neutral");
  });
});

// ── Testes para reclassifyByExpression (reclassificação histórica) ────────────
// Replica a função do servidor para testar isoladamente

function reclassifyByExpression(
  expression: string | null,
  confidence: string | null
): "satisfied" | "neutral" | "unsatisfied" {
  const conf = parseFloat(confidence ?? "0");
  const expr = (expression ?? "neutral").toLowerCase();

  if (expr === "happy") return conf >= 0.35 ? "satisfied" : "neutral";
  if (expr === "angry") return conf >= 0.55 ? "unsatisfied" : "neutral";
  if (expr === "disgusted") return conf >= 0.50 ? "unsatisfied" : "neutral";
  if (expr === "sad") return conf >= 0.60 ? "unsatisfied" : "neutral";
  return "neutral";
}

describe("reclassifyByExpression — reclassificação histórica por expressão dominante", () => {
  // happy
  it("happy + conf=0.35 → satisfied", () => {
    expect(reclassifyByExpression("happy", "0.35")).toBe("satisfied");
  });
  it("happy + conf=0.80 → satisfied", () => {
    expect(reclassifyByExpression("happy", "0.80")).toBe("satisfied");
  });
  it("happy + conf=0.20 (baixo) → neutral", () => {
    expect(reclassifyByExpression("happy", "0.20")).toBe("neutral");
  });

  // angry
  it("angry + conf=0.55 → unsatisfied", () => {
    expect(reclassifyByExpression("angry", "0.55")).toBe("unsatisfied");
  });
  it("angry + conf=0.40 (abaixo do threshold) → neutral", () => {
    expect(reclassifyByExpression("angry", "0.40")).toBe("neutral");
  });
  it("angry + conf=0.30 (rosto sério) → neutral", () => {
    expect(reclassifyByExpression("angry", "0.30")).toBe("neutral");
  });

  // disgusted
  it("disgusted + conf=0.50 → unsatisfied", () => {
    expect(reclassifyByExpression("disgusted", "0.50")).toBe("unsatisfied");
  });
  it("disgusted + conf=0.30 → neutral", () => {
    expect(reclassifyByExpression("disgusted", "0.30")).toBe("neutral");
  });

  // sad
  it("sad + conf=0.60 → unsatisfied", () => {
    expect(reclassifyByExpression("sad", "0.60")).toBe("unsatisfied");
  });
  it("sad + conf=0.45 (cansado) → neutral", () => {
    expect(reclassifyByExpression("sad", "0.45")).toBe("neutral");
  });

  // neutral, surprised, fearful sempre neutro
  it("neutral → neutral independente da confidence", () => {
    expect(reclassifyByExpression("neutral", "0.99")).toBe("neutral");
  });
  it("surprised → neutral", () => {
    expect(reclassifyByExpression("surprised", "0.80")).toBe("neutral");
  });
  it("fearful → neutral", () => {
    expect(reclassifyByExpression("fearful", "0.70")).toBe("neutral");
  });

  // null/undefined
  it("expression null → neutral", () => {
    expect(reclassifyByExpression(null, "0.90")).toBe("neutral");
  });
  it("confidence null → neutral (conf=0 abaixo de todos os thresholds)", () => {
    expect(reclassifyByExpression("angry", null)).toBe("neutral");
  });
});
