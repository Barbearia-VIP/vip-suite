import { LRUCache } from 'lru-cache';

/** Cache de consultas limitado por entradas, bytes serializados e TTL. */
interface CacheOptions {
  ttl?: number;
  max?: number;
  maxSize?: number;
}

type CacheKey = string;

export class QueryCache {
  private cache: LRUCache<CacheKey, any>;
  private expires = new Map<CacheKey, number>();
  private defaultTtl: number;
  private sweepTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl ?? 5 * 60 * 1000;
    this.cache = new LRUCache({
      max: options.max ?? 100,
      maxSize: options.maxSize ?? 8 * 1024 * 1024,
      dispose: (_value, key) => { this.expires.delete(key); },
      sizeCalculation: (value) => {
        try {
          return Math.max(1, Buffer.byteLength(JSON.stringify(value) ?? 'null'));
        } catch {
          return Number.MAX_SAFE_INTEGER;
        }
      },
    });
  }

  async get<T>(key: CacheKey, compute: () => Promise<T>, ttl?: number): Promise<T> {
    if ((this.expires.get(key) ?? 0) > Date.now()) {
      const cached = this.cache.get(key);
      if (cached !== undefined) return cached as T;
    }
    this.cache.delete(key);
    const result = await compute();
    this.set(key, result, ttl);
    return result;
  }

  set(key: CacheKey, value: unknown, ttl?: number): void {
    this.cache.set(key, value);
    if (this.cache.has(key)) this.expires.set(key, Date.now() + (ttl ?? this.defaultTtl));
    this.scheduleSweep();
  }

  invalidate(key: CacheKey): void {
    this.cache.delete(key);
    this.scheduleSweep();
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of Array.from(this.cache.keys())) {
      regex.lastIndex = 0;
      if (regex.test(key)) this.cache.delete(key);
    }
    this.scheduleSweep();
  }

  clear(): void {
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
    this.sweepTimer = null;
    this.cache.clear();
    this.expires.clear();
  }

  private scheduleSweep(): void {
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
    this.sweepTimer = null;
    if (!this.expires.size) return;
    const nearest = Math.min(...Array.from(this.expires.values()));
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      for (const [key, expiry] of Array.from(this.expires.entries())) {
        if (expiry <= Date.now()) this.cache.delete(key);
      }
      this.scheduleSweep();
    }, Math.max(1, nearest - Date.now()));
    this.sweepTimer.unref?.();
  }

  getStats() {
    return {
      size: this.cache.size,
      max: this.cache.max,
      keys: Array.from(this.cache.keys()).map(key => ({
        key,
        expiresAt: new Date(this.expires.get(key) ?? 0),
      })),
    };
  }
}

export const dashboardCache = new QueryCache({ max: 50, maxSize: 8 * 1024 * 1024, ttl: 5 * 60 * 1000 });
export const dataVipCache = new QueryCache({ max: 100, maxSize: 16 * 1024 * 1024, ttl: 10 * 60 * 1000 });
export const vipCamCache = new QueryCache({ max: 50, maxSize: 8 * 1024 * 1024, ttl: 2 * 60 * 1000 });

export const cacheKeys = {
  dashboardKpis: (unitId: number, date: string) => `dashboard:kpis:${unitId}:${date}`,
  dataVipDashboard: (unitId: number, startDate: string, endDate: string) =>
    `dataVip:dashboard:${unitId}:${startDate}:${endDate}`,
  dataVipChurn: (unitId: number, date: string) => `dataVip:churn:${unitId}:${date}`,
  dataVipTimeline: (unitId: number, page: number) => `dataVip:timeline:${unitId}:${page}`,
  vipCamDashboard: (unitId: number, date: string) => `vipCam:dashboard:${unitId}:${date}`,
  vipCamRecent: (unitId: number) => `vipCam:recent:${unitId}`,
};

export const invalidateCache = {
  dashboardUnit: (unitId: number) => dashboardCache.invalidatePattern(`^dashboard:kpis:${unitId}:`),
  dataVipUnit: (unitId: number) => dataVipCache.invalidatePattern(`^dataVip:.*:${unitId}:`),
  vipCamUnit: (unitId: number) => vipCamCache.invalidatePattern(`^vipCam:.*:${unitId}:`),
  all: () => {
    dashboardCache.clear();
    dataVipCache.clear();
    vipCamCache.clear();
  },
};
