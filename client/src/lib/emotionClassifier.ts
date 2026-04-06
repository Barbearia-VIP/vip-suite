/**
 * Classificador de emoções para o VIP Cam.
 * Regras calibradas para o modelo @vladmandic/face-api:
 *
 * NÍVEL 1 — Thresholds de frame:
 * - Insatisfeito: angry >= 0.30 OU disgusted >= 0.30 OU (sad >= 0.40 E happy < 0.15)
 * - Satisfeito: happy >= 0.12  ← captura expressões relaxadas/confortáveis (face-api retorna 0.08-0.20 para satisfação leve)
 * - Neutro: qualquer outra coisa (padrão)
 *
 * Justificativa: o modelo face-api retorna happy ~0.10-0.25 para expressões relaxadas/neutras-positivas.
 * Com threshold 0.20 ainda havia muitos neutros porque expressões confortáveis ficam em 0.10-0.18.
 * Reduzindo para 0.12 capturamos melhor a satisfação real em ambientes de barbearia.
 *
 * NÍVEL 2 — Regra de prioridade histórica por proporção:
 * - Insatisfeito: capturas insatisfeitas >= 25% do total
 * - Satisfeito: capturas satisfeitas >= 15% do total (e insatisfeitas < 25%)
 * - Desempate: se não há insatisfeitas e há pelo menos 1 satisfeita → Satisfeito
 * - Neutro: qualquer outra coisa
 *
 * Lógica de desempate: clientes com poucas capturas mas sem nenhuma negativa
 * devem ser considerados Satisfeitos, não Neutros.
 */

export type SatisfactionLevel = 'satisfied' | 'neutral' | 'unsatisfied';
export type ExpressionName = 'happy' | 'neutral' | 'angry' | 'surprised' | 'sad' | 'disgusted' | 'fearful';

export interface ExpressionScores {
  happy: number;
  neutral: number;
  angry: number;
  surprised: number;
  sad: number;
  disgusted: number;
  fearful: number;
}

/**
 * Classifica um frame único com base nas probabilidades de expressão.
 */
export function classifyExpression(scores: ExpressionScores): {
  satisfactionLevel: SatisfactionLevel;
  dominantExpression: ExpressionName;
} {
  // Encontrar a expressão dominante
  const entries = Object.entries(scores) as [ExpressionName, number][];
  const dominantExpression = entries.reduce((a, b) => b[1] > a[1] ? b : a)[0];

  // Regra de insatisfação — thresholds calibrados para capturar expressões sérias/tensas reais
  if (
    scores.angry >= 0.30 ||
    scores.disgusted >= 0.30 ||
    (scores.sad >= 0.40 && scores.happy < 0.15)
  ) {
    return { satisfactionLevel: 'unsatisfied', dominantExpression };
  }

  // Regra de satisfação — threshold baixo para capturar expressões relaxadas/confortáveis
  if (scores.happy >= 0.12) {
    return { satisfactionLevel: 'satisfied', dominantExpression };
  }

  // Neutro (padrão)
  return { satisfactionLevel: 'neutral', dominantExpression };
}

/**
 * Calcula a média das expressões de um buffer de frames.
 * Usado após a janela de captura de 1.5s.
 */
export function averageExpressions(frames: ExpressionScores[]): ExpressionScores {
  if (frames.length === 0) {
    return { happy: 0, neutral: 1, angry: 0, surprised: 0, sad: 0, disgusted: 0, fearful: 0 };
  }
  const sum = frames.reduce((acc, f) => ({
    happy: acc.happy + f.happy,
    neutral: acc.neutral + f.neutral,
    angry: acc.angry + f.angry,
    surprised: acc.surprised + f.surprised,
    sad: acc.sad + f.sad,
    disgusted: acc.disgusted + f.disgusted,
    fearful: acc.fearful + f.fearful,
  }), { happy: 0, neutral: 0, angry: 0, surprised: 0, sad: 0, disgusted: 0, fearful: 0 });

  const n = frames.length;
  return {
    happy: sum.happy / n,
    neutral: sum.neutral / n,
    angry: sum.angry / n,
    surprised: sum.surprised / n,
    sad: sum.sad / n,
    disgusted: sum.disgusted / n,
    fearful: sum.fearful / n,
  };
}

/**
 * Calcula a distância euclidiana entre dois descritores faciais.
 * Threshold: 0.42 (abaixo = mesmo cliente)
 */
export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

export const FACE_MATCH_THRESHOLD = 0.42;

/**
 * Encontra o cliente mais próximo no cache de descritores.
 */
export function findMatchingClient(
  descriptor: Float32Array | number[],
  cache: Array<{ id: number; faceDescriptor: number[] | null }>
): { clienteId: number; distance: number } | null {
  let bestMatch: { clienteId: number; distance: number } | null = null;

  for (const cached of cache) {
    if (!cached.faceDescriptor || cached.faceDescriptor.length === 0) continue;
    const distance = euclideanDistance(descriptor, cached.faceDescriptor);
    if (distance < FACE_MATCH_THRESHOLD) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { clienteId: cached.id, distance };
      }
    }
  }

  return bestMatch;
}

/**
 * Regra de status final:
 *   1. Se houver PELO MENOS 1 captura satisfeita → satisfied
 *      (uma reação positiva real prevalece sobre capturas neutras)
 *   2. Se insatisfeitos >= 25% do total (e nenhuma satisfeita) → unsatisfied
 *   3. Caso contrário → neutral
 */
export function calcFinalSatisfactionLevel(
  timeline: Array<{ satisfactionLevel: SatisfactionLevel }>
): SatisfactionLevel {
  const total = timeline.length;
  if (total === 0) return 'neutral';

  const satisfied = timeline.filter(t => t.satisfactionLevel === 'satisfied').length;
  const unsatisfied = timeline.filter(t => t.satisfactionLevel === 'unsatisfied').length;

  // Pelo menos 1 captura satisfeita → Satisfeito (reação positiva real prevalece)
  if (satisfied >= 1) return 'satisfied';

  // Sem nenhuma satisfeita: insatisfeito se >= 25% das capturas forem negativas
  const pctUnsatisfied = unsatisfied / total;
  if (pctUnsatisfied >= 0.25) return 'unsatisfied';

  // Neutro em todos os outros casos
  return 'neutral';
}

/**
 * Rótulos em português para exibição
 */
export const SATISFACTION_LABELS: Record<SatisfactionLevel, string> = {
  satisfied: 'Satisfeito',
  neutral: 'Neutro',
  unsatisfied: 'Insatisfeito',
};

export const SATISFACTION_COLORS: Record<SatisfactionLevel, string> = {
  satisfied: '#22c55e',   // green-500
  neutral: '#f59e0b',     // amber-500
  unsatisfied: '#ef4444', // red-500
};

export const SATISFACTION_EMOJIS: Record<SatisfactionLevel, string> = {
  satisfied: '😊',
  neutral: '😐',
  unsatisfied: '😠',
};

/**
 * Thresholds exportados para uso em outros módulos (ex: reclassificação histórica no backend)
 */
export const EMOTION_THRESHOLDS = {
  /** angry >= este valor → insatisfeito */
  ANGRY: 0.30,
  /** disgusted >= este valor → insatisfeito */
  DISGUSTED: 0.30,
  /** sad >= este valor (com happy < SAD_HAPPY_MAX) → insatisfeito */
  SAD: 0.40,
  /** happy deve ser menor que este valor para sad ser considerado insatisfeito */
  SAD_HAPPY_MAX: 0.12,
  /** happy >= este valor → satisfeito */
  HAPPY: 0.12,
  /** % mínima de capturas insatisfeitas para status final = insatisfeito */
  PCT_UNSATISFIED: 0.25,
  /** % mínima de capturas satisfeitas para status final = satisfeito */
  PCT_SATISFIED: 0.15,
} as const;
