import { LRUCache } from 'lru-cache';

/**
 * Cache em memória para queries pesadas
 * - TTL configurável por tipo de dado
 * - Invalidação manual por chave
 * - Suporte a invalidação em massa por padrão
 */

interface CacheOptions {
  ttl?: number; // milliseconds
  max?: number; // max items in cache
}

type CacheKey = string;

class QueryCache {
  private cache: LRUCache<CacheKey, any>;
  private ttls: Map<CacheKey, number> = new Map();
  private timers: Map<CacheKey, NodeJS.Timeout> = new Map();

  constructor(options: CacheOptions = {}) {
    this.cache = new LRUCache({
      max: options.max || 100,
      ttl: options.ttl || 5 * 60 * 1000, // 5 min default
    });
  }

  /**
   * Get cached value or compute it
   */
  async get<T>(
    key: CacheKey,
    compute: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached as T;
    }

    const result = await compute();
    this.set(key, result, ttl);
    return result;
  }

  /**
   * Set cache value
   */
  set(key: CacheKey, value: any, ttl?: number): void {
    // Clear existing timer
    const existingTimer = this.timers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    // Set value
    this.cache.set(key, value);

    // Set expiration timer
    const effectiveTtl = ttl || 5 * 60 * 1000;
    const timer = setTimeout(() => {
      this.invalidate(key);
    }, effectiveTtl);

    this.timers.set(key, timer);
    this.ttls.set(key, Date.now() + effectiveTtl);
  }

  /**
   * Invalidate single key
   */
  invalidate(key: CacheKey): void {
    this.cache.delete(key);
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    this.ttls.delete(key);
  }

  /**
   * Invalidate multiple keys by pattern
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    const keysToInvalidate: CacheKey[] = [];
    for (const key of Array.from(this.cache.keys())) {
      if (regex.test(key)) {
        keysToInvalidate.push(key);
      }
    }
    keysToInvalidate.forEach(key => this.invalidate(key));
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const timersToCancel = Array.from(this.timers.values());
    timersToCancel.forEach(timer => clearTimeout(timer));
    this.cache.clear();
    this.timers.clear();
    this.ttls.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      max: this.cache.max,
      keys: Array.from(this.cache.keys()).map(key => ({
        key,
        expiresAt: new Date(this.ttls.get(key) || 0),
      })),
    };
  }
}

// Global cache instances
export const dashboardCache = new QueryCache({
  max: 50,
  ttl: 5 * 60 * 1000, // 5 minutes
});

export const dataVipCache = new QueryCache({
  max: 100,
  ttl: 10 * 60 * 1000, // 10 minutes
});

export const vipCamCache = new QueryCache({
  max: 50,
  ttl: 2 * 60 * 1000, // 2 minutes
});

/**
 * Cache key builders
 */
export const cacheKeys = {
  // Dashboard
  dashboardKpis: (unitId: number, date: string) => `dashboard:kpis:${unitId}:${date}`,
  
  // Data VIP
  dataVipDashboard: (unitId: number, startDate: string, endDate: string) =>
    `dataVip:dashboard:${unitId}:${startDate}:${endDate}`,
  dataVipChurn: (unitId: number, date: string) => `dataVip:churn:${unitId}:${date}`,
  dataVipTimeline: (unitId: number, page: number) => `dataVip:timeline:${unitId}:${page}`,
  
  // VIP Cam
  vipCamDashboard: (unitId: number, date: string) => `vipCam:dashboard:${unitId}:${date}`,
  vipCamRecent: (unitId: number) => `vipCam:recent:${unitId}`,
};

/**
 * Invalidation helpers
 */
export const invalidateCache = {
  // Invalidate all dashboard cache for a unit
  dashboardUnit: (unitId: number) => {
    dashboardCache.invalidatePattern(`^dashboard:kpis:${unitId}:`);
  },

  // Invalidate all Data VIP cache for a unit
  dataVipUnit: (unitId: number) => {
    dataVipCache.invalidatePattern(`^dataVip:.*:${unitId}:`);
  },

  // Invalidate all VIP Cam cache for a unit
  vipCamUnit: (unitId: number) => {
    vipCamCache.invalidatePattern(`^vipCam:.*:${unitId}:`);
  },

  // Invalidate all caches
  all: () => {
    dashboardCache.clear();
    dataVipCache.clear();
    vipCamCache.clear();
  },
};
