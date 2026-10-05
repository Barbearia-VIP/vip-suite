import { describe, expect, it } from 'vitest';
import { extractJpegFrames } from './mjpegFrames';

const jpeg = (payload: string) => Buffer.from([0xff, 0xd8, ...Buffer.from(payload), 0xff, 0xd9]);

describe('extractJpegFrames', () => {
  it('reconstitui frames fragmentados e extrai múltiplos frames sem reter lixo', () => {
    const frame1 = jpeg('one');
    const frame2 = jpeg('two');
    const first = extractJpegFrames(Buffer.alloc(0), frame1.subarray(0, 3), 128);
    expect(first.frames).toHaveLength(0);
    const second = extractJpegFrames(first.remaining, Buffer.concat([frame1.subarray(3), frame2]), 128);
    expect(second.frames).toEqual([frame1, frame2]);
    expect(second.remaining).toHaveLength(0);
  });

  it('descarta frame parcial acima do limite e recupera no SOI seguinte', () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(64, 0)]);
    const first = extractJpegFrames(Buffer.alloc(0), broken, 32);
    expect(first.dropped).toBe(true);
    expect(first.remaining).toHaveLength(0);
    const recovered = extractJpegFrames(first.remaining, jpeg('ok'), 32);
    expect(recovered.frames).toEqual([jpeg('ok')]);
  });

  it('preserva SOI repartido entre dois chunks', () => {
    const first = extractJpegFrames(Buffer.alloc(0), Buffer.from([1, 2, 0xff]), 32);
    const second = extractJpegFrames(first.remaining, Buffer.from([0xd8, 3, 0xff, 0xd9]), 32);
    expect(second.frames).toEqual([Buffer.from([0xff, 0xd8, 3, 0xff, 0xd9])]);
  });
});
