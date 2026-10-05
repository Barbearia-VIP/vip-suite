import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryCache } from './cache';

describe('QueryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('respeita o TTL particular e liberta entradas expiradas', async () => {
    const cache = new QueryCache({ ttl: 10_000, maxSize: 1024 });
    const compute = vi.fn().mockResolvedValue('novo');
    cache.set('short', 'antigo', 100);
    cache.set('long', 'mantido');
    expect(cache.getStats().keys.find(x => x.key === 'short')?.expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 95);
    await vi.advanceTimersByTimeAsync(101);
    expect(cache.getStats().size).toBe(1);
    expect(await cache.get('short', compute)).toBe('novo');
    expect(compute).toHaveBeenCalledTimes(1);
    expect(await cache.get('long', compute)).toBe('mantido');
  });

  it('não retém resultados maiores que o orçamento de bytes', async () => {
    const cache = new QueryCache({ max: 10, maxSize: 80 });
    cache.set('a', 'x'.repeat(30));
    cache.set('b', 'y'.repeat(30));
    cache.set('huge', 'z'.repeat(100));
    expect(cache.getStats().size).toBeLessThanOrEqual(2);
    expect(cache.getStats().keys.map(x => x.key)).not.toContain('huge');
    const compute = vi.fn().mockResolvedValue('recalculado');
    expect(await cache.get('huge', compute)).toBe('recalculado');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('remove chaves selecionadas e não deixa timers pendurados após clear', () => {
    const cache = new QueryCache({ ttl: 500, maxSize: 1024 });
    cache.set('dashboard:1', { total: 1 });
    cache.set('dashboard:2', { total: 2 });
    cache.invalidatePattern('^dashboard:1$');
    expect(cache.getStats().keys.map(x => x.key)).toEqual(['dashboard:2']);
    cache.clear();
    expect(cache.getStats().size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
