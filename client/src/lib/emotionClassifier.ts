/**
 * Classificador de emoções para o VIP Cam.
 * Regras calibradas para o modelo @vladmandic/face-api:
 *
 * O modelo retorna valores de angry/disgusted/sad elevados mesmo para rostos neutros.
 * Thresholds altos evitam falsos positivos de insatisfação.
 *
 * - Insatisfeito: angry >= 0.55 OU disgusted >= 0.50 OU (sad >= 0.60 E happy < 0.15)
 * - Satisfeito: happy >= 0.35
 * - Neutro: qualquer outra coisa (padrão)
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

  // Regra de insatisfação (thresholds altos para evitar falsos positivos)
  // O modelo face-api retorna angry/disgusted/sad elevados mesmo para rostos neutros-sérios.
  if (
    scores.angry >= 0.55 ||
    scores.disgusted >= 0.50 ||
    (scores.sad >= 0.60 && scores.happy < 0.15)
  ) {
    return { satisfactionLevel: 'unsatisfied', dominantExpression };
  }

  // Regra de satisfação (threshold levemente reduzido para capturar sorrisos leves)
  if (scores.happy >= 0.35) {
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
 * O valor 0.55 era muito permissivo e causava agrupamento de rostos distintos.
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
 * Aplica a regra de prioridade de emoção baseada no histórico:
 * 1. Se houver QUALQUER "satisfied" → satisfied
 * 2. Se neutros >= insatisfeitos → neutral
 * 3. Caso contrário → unsatisfied
 */
export function calcFinalSatisfactionLevel(
  timeline: Array<{ satisfactionLevel: SatisfactionLevel }>
): SatisfactionLevel {
  const satisfied = timeline.filter(t => t.satisfactionLevel === 'satisfied').length;
  if (satisfied > 0) return 'satisfied';
  const neutral = timeline.filter(t => t.satisfactionLevel === 'neutral').length;
  const unsatisfied = timeline.filter(t => t.satisfactionLevel === 'unsatisfied').length;
  if (neutral >= unsatisfied) return 'neutral';
  return 'unsatisfied';
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
