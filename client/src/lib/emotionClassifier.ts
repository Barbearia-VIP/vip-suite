/**
 * Classificador de emoções para o VIP Cam.
 * Regras calibradas para o modelo @vladmandic/face-api:
 *
 * NÍVEL 1 — Thresholds calibrados:
 * - Insatisfeito: angry >= 0.35 OU disgusted >= 0.35 OU (sad >= 0.45 E happy < 0.20)
 * - Satisfeito: happy >= 0.20  ← reduzido de 0.35 para capturar sorrisos leves e expressões relaxadas
 * - Neutro: qualquer outra coisa (padrão)
 *
 * Justificativa: o modelo face-api retorna happy ~0.15-0.30 para expressões relaxadas/neutras-positivas
 * (cliente confortável, satisfeito mas sem sorriso amplo). Com threshold 0.35, esses clientes viravam
 * Neutro. Com 0.20, capturamos a satisfação real sem exigir sorriso exagerado.
 *
 * NÍVEL 2 — Regra de prioridade histórica por proporção:
 * - Insatisfeito: capturas insatisfeitas >= 30% do total
 * - Satisfeito: capturas satisfeitas >= 25% do total (e insatisfeitas < 30%)  ← reduzido de 40%
 * - Neutro: qualquer outra coisa
 *
 * Com threshold happy=0.20, mais capturas serão satisfeitas → exigir apenas 25% para status final
 * evita que clientes com poucas capturas fiquem presos em Neutro.
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
 * Thresholds reduzidos (Nível 1) para capturar insatisfação real.
 */
export function classifyExpression(scores: ExpressionScores): {
  satisfactionLevel: SatisfactionLevel;
  dominantExpression: ExpressionName;
} {
  // Encontrar a expressão dominante
  const entries = Object.entries(scores) as [ExpressionName, number][];
  const dominantExpression = entries.reduce((a, b) => b[1] > a[1] ? b : a)[0];

  // Regra de insatisfação — thresholds reduzidos para capturar expressões sérias/tensas reais
  if (
    scores.angry >= 0.35 ||
    scores.disgusted >= 0.35 ||
    (scores.sad >= 0.45 && scores.happy < 0.20)
  ) {
    return { satisfactionLevel: 'unsatisfied', dominantExpression };
  }

  // Regra de satisfação — threshold reduzido para capturar sorrisos leves e expressões relaxadas
  if (scores.happy >= 0.20) {
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
 *
 * Calibrado para @vladmandic/face-api (descritores de 128 dimensões):
 * - < 0.42: mesma pessoa (alta confiança)
 * - 0.42–0.55: possivelmente a mesma pessoa (zona cinza)
 * - > 0.55: pessoas diferentes
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
 * Retorna o ID do cliente se a distância for menor que o threshold.
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
 * Aplica a regra de prioridade por PROPORÇÃO (Nível 2).
 *
 * Lógica anterior (otimista demais):
 *   1. Se houver QUALQUER "satisfied" → satisfied para sempre
 *   2. Se neutros >= insatisfeitos → neutral
 *   3. Caso contrário → unsatisfied
 *
 * Nova lógica (proporcional):
 *   1. Se insatisfeitos >= 30% do total → unsatisfied
 *   2. Se satisfeitos >= 40% do total (e insatisfeitos < 30%) → satisfied
 *   3. Caso contrário → neutral
 *
 * Isso reflete a experiência real do cliente ao longo do tempo,
 * sem que um único sorriso apague todo o histórico negativo.
 */
export function calcFinalSatisfactionLevel(
  timeline: Array<{ satisfactionLevel: SatisfactionLevel }>
): SatisfactionLevel {
  const total = timeline.length;
  if (total === 0) return 'neutral';

  const satisfied = timeline.filter(t => t.satisfactionLevel === 'satisfied').length;
  const unsatisfied = timeline.filter(t => t.satisfactionLevel === 'unsatisfied').length;

  const pctUnsatisfied = unsatisfied / total;
  const pctSatisfied = satisfied / total;

  // Insatisfeito prevalece se >= 30% das capturas forem negativas
  if (pctUnsatisfied >= 0.30) return 'unsatisfied';

  // Satisfeito se >= 25% das capturas forem positivas (e insatisfeitos < 30%)
  if (pctSatisfied >= 0.25) return 'satisfied';

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
  ANGRY: 0.35,
  /** disgusted >= este valor → insatisfeito */
  DISGUSTED: 0.35,
  /** sad >= este valor (com happy < SAD_HAPPY_MAX) → insatisfeito */
  SAD: 0.45,
  /** happy deve ser menor que este valor para sad ser considerado insatisfeito */
  SAD_HAPPY_MAX: 0.20,
  /** happy >= este valor → satisfeito */
  HAPPY: 0.20,
  /** % mínima de capturas insatisfeitas para status final = insatisfeito */
  PCT_UNSATISFIED: 0.30,
  /** % mínima de capturas satisfeitas para status final = satisfeito */
  PCT_SATISFIED: 0.25,
} as const;
