/**
 * Testes unitários para o faceRecognitionService
 *
 * Testa as funções puras (matchFaceDescriptor, mapExpressionToSatisfaction)
 * sem precisar carregar os modelos de IA.
 */
import { describe, it, expect } from 'vitest';
import { matchFaceDescriptor } from './faceRecognitionService';

// ─── matchFaceDescriptor ────────────────────────────────────────────────────

describe('matchFaceDescriptor', () => {
  const makeDescriptor = (base: number, noise = 0): number[] => {
    return Array.from({ length: 128 }, (_, i) => base + i * 0.001 + noise);
  };

  it('retorna null quando não há clientes cadastrados', () => {
    const descriptor = makeDescriptor(0.5);
    const result = matchFaceDescriptor(descriptor, []);
    expect(result).toBeNull();
  });

  it('retorna null quando todos os clientes têm faceDescriptor null', () => {
    const descriptor = makeDescriptor(0.5);
    const clientes = [
      { id: 1, faceDescriptor: null },
      { id: 2, faceDescriptor: null },
    ];
    const result = matchFaceDescriptor(descriptor, clientes);
    expect(result).toBeNull();
  });

  it('encontra o cliente com descriptor idêntico (distância = 0)', () => {
    const descriptor = makeDescriptor(0.5);
    const clientes = [
      { id: 1, faceDescriptor: makeDescriptor(0.5) }, // mesmo descriptor
      { id: 2, faceDescriptor: makeDescriptor(0.9) }, // diferente
    ];
    const result = matchFaceDescriptor(descriptor, clientes);
    expect(result).not.toBeNull();
    expect(result!.clienteId).toBe(1);
    expect(result!.distance).toBeCloseTo(0, 5);
  });

  it('retorna null quando todos os clientes estão acima do threshold (0.55)', () => {
    const descriptor = makeDescriptor(0.0);
    const clientes = [
      { id: 1, faceDescriptor: makeDescriptor(1.0) }, // distância grande
      { id: 2, faceDescriptor: makeDescriptor(2.0) }, // distância ainda maior
    ];
    const result = matchFaceDescriptor(descriptor, clientes);
    expect(result).toBeNull();
  });

  it('retorna o cliente mais próximo quando há múltiplos candidatos abaixo do threshold', () => {
    const descriptor = makeDescriptor(0.5);
    // Cliente 1: distância pequena (muito próximo)
    const close = makeDescriptor(0.5);
    close[0] += 0.1; // pequena diferença

    // Cliente 2: distância um pouco maior mas ainda abaixo do threshold
    const medium = makeDescriptor(0.5);
    medium[0] += 0.2;
    medium[1] += 0.2;

    const clientes = [
      { id: 1, faceDescriptor: close },
      { id: 2, faceDescriptor: medium },
    ];
    const result = matchFaceDescriptor(descriptor, clientes);
    expect(result).not.toBeNull();
    expect(result!.clienteId).toBe(1); // deve retornar o mais próximo
  });

  it('ignora clientes com descriptor de tamanho diferente', () => {
    const descriptor = makeDescriptor(0.5); // 128 elementos
    const clientes = [
      { id: 1, faceDescriptor: [0.5, 0.5, 0.5] }, // tamanho errado (3 elementos)
    ];
    const result = matchFaceDescriptor(descriptor, clientes);
    expect(result).toBeNull();
  });

  it('retorna distância correta para match encontrado', () => {
    // Dois descritores com diferença conhecida
    const a = new Array(128).fill(0);
    const b = new Array(128).fill(0);
    b[0] = 0.1; // diferença de 0.1 em uma dimensão

    const clientes = [{ id: 42, faceDescriptor: b }];
    const result = matchFaceDescriptor(a, clientes);
    expect(result).not.toBeNull();
    expect(result!.clienteId).toBe(42);
    expect(result!.distance).toBeCloseTo(0.1, 5);
  });
});

// ─── IoU e deduplicação (replicada do worker) ──────────────────────────────────

describe('IoU deduplication logic', () => {
  function iou(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): number {
    const ax2 = a.x + a.width, ay2 = a.y + a.height;
    const bx2 = b.x + b.width, by2 = b.y + b.height;
    const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y);
    const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
    if (ix2 <= ix1 || iy2 <= iy1) return 0;
    const inter = (ix2 - ix1) * (iy2 - iy1);
    return inter / (a.width * a.height + b.width * b.height - inter);
  }

  it('boxes idênticas têm IoU = 1', () => {
    const box = { x: 10, y: 10, width: 50, height: 50 };
    expect(iou(box, box)).toBeCloseTo(1, 5);
  });

  it('boxes sem sobreposição têm IoU = 0', () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 100, y: 100, width: 50, height: 50 };
    expect(iou(a, b)).toBe(0);
  });

  it('boxes com 50% de sobreposição têm IoU correto', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 0, width: 100, height: 100 }; // metade sobreposta
    // interseção = 50x100 = 5000; união = 10000+10000-5000 = 15000; IoU = 1/3
    expect(iou(a, b)).toBeCloseTo(1 / 3, 2);
  });

  it('boxes adjacentes (sem sobreposição) têm IoU = 0', () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 50, y: 0, width: 50, height: 50 };
    expect(iou(a, b)).toBe(0);
  });
});

// ─── Integração: lógica de satisfação (replicada do worker) ─────────────────

describe('mapExpressionToSatisfaction (lógica interna)', () => {
  // Testa a lógica de mapeamento diretamente, sem importar a função privada
  // Usamos a mesma lógica que está no faceRecognitionService.ts

  function mapExpression(expression: string, score: number): string {
    if (expression === 'happy' && score > 0.4) return 'satisfied';
    if (['angry', 'disgusted', 'sad'].includes(expression) && score > 0.4) return 'unsatisfied';
    return 'neutral';
  }

  it('happy com score alto → satisfied', () => {
    expect(mapExpression('happy', 0.8)).toBe('satisfied');
  });

  it('happy com score baixo → neutral', () => {
    expect(mapExpression('happy', 0.3)).toBe('neutral');
  });

  it('angry com score alto → unsatisfied', () => {
    expect(mapExpression('angry', 0.7)).toBe('unsatisfied');
  });

  it('sad com score alto → unsatisfied', () => {
    expect(mapExpression('sad', 0.6)).toBe('unsatisfied');
  });

  it('disgusted com score alto → unsatisfied', () => {
    expect(mapExpression('disgusted', 0.5)).toBe('unsatisfied');
  });

  it('neutral → neutral', () => {
    expect(mapExpression('neutral', 0.9)).toBe('neutral');
  });

  it('surprised → neutral', () => {
    expect(mapExpression('surprised', 0.9)).toBe('neutral');
  });

  it('fearful → neutral', () => {
    expect(mapExpression('fearful', 0.9)).toBe('neutral');
  });
});
