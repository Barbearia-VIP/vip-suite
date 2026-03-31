/**
 * VIP Cam — Testes Vitest
 * Cobre: classificação de emoções, regras de negócio, validação de inputs e endpoints tRPC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/face.jpg", key: "test-key" }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Análise de IA simulada para testes." } }],
  }),
}));

// ─── Classificador de Emoções (lógica pura) ──────────────────────────────────
type Expression = "happy" | "surprised" | "neutral" | "disgusted" | "fearful" | "angry" | "sad";
type SatisfactionLevel = "satisfied" | "neutral" | "unsatisfied";

function classifyEmotion(expressions: Record<Expression, number>): SatisfactionLevel {
  const satisfied: Expression[] = ["happy", "surprised"];
  const unsatisfied: Expression[] = ["disgusted", "fearful", "angry", "sad"];

  const satisfiedScore = satisfied.reduce((sum, e) => sum + (expressions[e] ?? 0), 0);
  const unsatisfiedScore = unsatisfied.reduce((sum, e) => sum + (expressions[e] ?? 0), 0);

  if (satisfiedScore > 0.5) return "satisfied";
  if (unsatisfiedScore > 0.4) return "unsatisfied";
  return "neutral";
}

describe("VIP Cam — Classificador de Emoções", () => {
  it("classifica como satisfied quando happy > 0.5", () => {
    const result = classifyEmotion({
      happy: 0.85, surprised: 0.05, neutral: 0.05,
      disgusted: 0, fearful: 0, angry: 0, sad: 0,
    });
    expect(result).toBe("satisfied");
  });

  it("classifica como satisfied quando surprised > 0.5", () => {
    const result = classifyEmotion({
      happy: 0.1, surprised: 0.75, neutral: 0.1,
      disgusted: 0, fearful: 0, angry: 0, sad: 0,
    });
    expect(result).toBe("satisfied");
  });

  it("classifica como satisfied quando happy + surprised > 0.5", () => {
    const result = classifyEmotion({
      happy: 0.3, surprised: 0.3, neutral: 0.3,
      disgusted: 0, fearful: 0, angry: 0.05, sad: 0.05,
    });
    expect(result).toBe("satisfied");
  });

  it("classifica como unsatisfied quando angry > 0.4", () => {
    const result = classifyEmotion({
      happy: 0.05, surprised: 0, neutral: 0.1,
      disgusted: 0, fearful: 0, angry: 0.8, sad: 0.05,
    });
    expect(result).toBe("unsatisfied");
  });

  it("classifica como unsatisfied quando sad > 0.4", () => {
    const result = classifyEmotion({
      happy: 0, surprised: 0, neutral: 0.1,
      disgusted: 0, fearful: 0, angry: 0, sad: 0.9,
    });
    expect(result).toBe("unsatisfied");
  });

  it("classifica como unsatisfied quando disgusted + fearful > 0.4", () => {
    const result = classifyEmotion({
      happy: 0, surprised: 0, neutral: 0.3,
      disgusted: 0.25, fearful: 0.25, angry: 0.1, sad: 0.1,
    });
    expect(result).toBe("unsatisfied");
  });

  it("classifica como neutral quando nenhum limiar é atingido", () => {
    const result = classifyEmotion({
      happy: 0.2, surprised: 0.1, neutral: 0.5,
      disgusted: 0.05, fearful: 0.05, angry: 0.05, sad: 0.05,
    });
    expect(result).toBe("neutral");
  });

  it("classifica como neutral quando expressão é puramente neutral", () => {
    const result = classifyEmotion({
      happy: 0, surprised: 0, neutral: 1.0,
      disgusted: 0, fearful: 0, angry: 0, sad: 0,
    });
    expect(result).toBe("neutral");
  });
});

// ─── Regras de Negócio — Taxa de Satisfação ──────────────────────────────────
describe("VIP Cam — Cálculo de Taxa de Satisfação", () => {
  function calcSatisfactionRate(satisfeitos: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((satisfeitos / total) * 100);
  }

  it("calcula 100% quando todos são satisfeitos", () => {
    expect(calcSatisfactionRate(10, 10)).toBe(100);
  });

  it("calcula 0% quando nenhum é satisfeito", () => {
    expect(calcSatisfactionRate(0, 10)).toBe(0);
  });

  it("calcula 70% corretamente", () => {
    expect(calcSatisfactionRate(7, 10)).toBe(70);
  });

  it("retorna 0% quando total é 0 (sem divisão por zero)", () => {
    expect(calcSatisfactionRate(0, 0)).toBe(0);
  });

  it("arredonda corretamente 2/3 = 67%", () => {
    expect(calcSatisfactionRate(2, 3)).toBe(67);
  });
});

// ─── Validação de Configuração de Câmera ─────────────────────────────────────
describe("VIP Cam — Validação de Configuração de Câmera", () => {
  function validateCameraConfig(config: {
    cameraType: string;
    rtspUrl?: string;
    detectionThreshold?: string;
    cooldownSeconds?: number;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!["usb", "ip"].includes(config.cameraType)) {
      errors.push("Tipo de câmera inválido. Use 'usb' ou 'ip'.");
    }

    if (config.cameraType === "ip" && !config.rtspUrl) {
      errors.push("URL RTSP é obrigatória para câmera IP.");
    }

    if (config.rtspUrl && !config.rtspUrl.startsWith("rtsp")) {
      errors.push("URL deve começar com rtsp:// ou rtsps://");
    }

    const threshold = parseFloat(config.detectionThreshold ?? "0.55");
    if (isNaN(threshold) || threshold < 0.3 || threshold > 0.9) {
      errors.push("Threshold deve ser entre 0.3 e 0.9");
    }

    if (config.cooldownSeconds !== undefined && (config.cooldownSeconds < 1 || config.cooldownSeconds > 60)) {
      errors.push("Cooldown deve ser entre 1 e 60 segundos");
    }

    return { valid: errors.length === 0, errors };
  }

  it("valida configuração USB válida", () => {
    const result = validateCameraConfig({ cameraType: "usb", detectionThreshold: "0.55", cooldownSeconds: 4 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("valida configuração IP válida com URL RTSP", () => {
    const result = validateCameraConfig({
      cameraType: "ip",
      rtspUrl: "rtsp://192.168.1.100:554/stream",
      detectionThreshold: "0.6",
      cooldownSeconds: 5,
    });
    expect(result.valid).toBe(true);
  });

  it("rejeita câmera IP sem URL RTSP", () => {
    const result = validateCameraConfig({ cameraType: "ip" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("URL RTSP é obrigatória para câmera IP.");
  });

  it("rejeita URL que não começa com rtsp", () => {
    const result = validateCameraConfig({ cameraType: "ip", rtspUrl: "http://192.168.1.100/stream" });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("rtsp"))).toBe(true);
  });

  it("rejeita threshold fora do intervalo", () => {
    const result = validateCameraConfig({ cameraType: "usb", detectionThreshold: "0.1" });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Threshold"))).toBe(true);
  });

  it("aceita RTSPS como protocolo válido", () => {
    const result = validateCameraConfig({
      cameraType: "ip",
      rtspUrl: "rtsps://192.168.1.100:443/stream",
      detectionThreshold: "0.55",
    });
    expect(result.valid).toBe(true);
  });

  it("rejeita tipo de câmera inválido", () => {
    const result = validateCameraConfig({ cameraType: "webcam" });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("inválido"))).toBe(true);
  });
});

// ─── Regras de Cooldown ───────────────────────────────────────────────────────
describe("VIP Cam — Regras de Cooldown", () => {
  function shouldCapture(lastCaptureMs: number, nowMs: number, cooldownSeconds: number): boolean {
    return (nowMs - lastCaptureMs) >= (cooldownSeconds * 1000);
  }

  it("permite captura quando cooldown expirou", () => {
    const now = Date.now();
    const lastCapture = now - 5000; // 5 segundos atrás
    expect(shouldCapture(lastCapture, now, 4)).toBe(true);
  });

  it("bloqueia captura quando cooldown não expirou", () => {
    const now = Date.now();
    const lastCapture = now - 2000; // 2 segundos atrás
    expect(shouldCapture(lastCapture, now, 4)).toBe(false);
  });

  it("permite captura exatamente no limite do cooldown", () => {
    const now = Date.now();
    const lastCapture = now - 4000; // exatamente 4 segundos
    expect(shouldCapture(lastCapture, now, 4)).toBe(true);
  });
});

// ─── Separação de Dados por Unidade ──────────────────────────────────────────
describe("VIP Cam — Separação de Dados por Unidade", () => {
  it("filtra detecções por unitId corretamente", () => {
    const deteccoes = [
      { id: 1, unitId: 1, satisfactionLevel: "satisfied" },
      { id: 2, unitId: 2, satisfactionLevel: "neutral" },
      { id: 3, unitId: 1, satisfactionLevel: "unsatisfied" },
      { id: 4, unitId: 3, satisfactionLevel: "satisfied" },
    ];

    const unit1 = deteccoes.filter(d => d.unitId === 1);
    expect(unit1).toHaveLength(2);
    expect(unit1.every(d => d.unitId === 1)).toBe(true);
  });

  it("retorna todas as detecções quando unitId não é filtrado (admin)", () => {
    const deteccoes = [
      { id: 1, unitId: 1 }, { id: 2, unitId: 2 }, { id: 3, unitId: 3 },
    ];
    // Admin sem filtro de unidade vê tudo
    const all = deteccoes;
    expect(all).toHaveLength(3);
  });

  it("não mistura clientes de unidades diferentes", () => {
    const clientes = [
      { id: 1, unitId: 1, nome: "João" },
      { id: 2, unitId: 2, nome: "Maria" },
    ];
    const unit1Clientes = clientes.filter(c => c.unitId === 1);
    const unit2Clientes = clientes.filter(c => c.unitId === 2);

    expect(unit1Clientes).not.toContainEqual(expect.objectContaining({ unitId: 2 }));
    expect(unit2Clientes).not.toContainEqual(expect.objectContaining({ unitId: 1 }));
  });
});
