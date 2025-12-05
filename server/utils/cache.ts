/**
 * Cache utility for server-side caching using Nitro storage
 * Provides a simple interface for caching API responses and other data
 */

export type CacheOptions = {
  /**
   * Time to live in seconds (how long the cache is valid)
   * @default 3600 (1 hour)
   */
  ttl?: number;
  /**
   * Cache key prefix to organize cached items
   * @default 'api'
   */
  prefix?: string;
}

/**
 * Get data from cache or fetch it if not cached
 * @param key - Unique cache key
 * @param fetcher - Function to fetch data if not in cache
 * @param options - Cache options (ttl, prefix)
 * @returns Cached or freshly fetched data
 */
export async function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = 3600, prefix = 'api' } = options;
  const cacheKey = `${prefix}:${key}`;

  const storage = useStorage('cache');

  // Try to get from cache
  const cached = await storage.getItem<{ data: T; timestamp: number }>(cacheKey);

  // Check if cache is valid
  if (cached && cached.timestamp) {
    const age = Date.now() - cached.timestamp;
    const maxAge = ttl * 1000;

    if (age < maxAge) {
      return cached.data;
    }
  }

  // Cache miss - fetch fresh data
  console.log(`Cache MISS for key: ${cacheKey}`);
  const data = await fetcher();

  // Store in cache with timestamp
  await storage.setItem(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  return data;
}

/**
 * Invalidate (delete) a cached item
 * @param key - Cache key to invalidate
 * @param prefix - Cache key prefix
 */
export async function invalidateCache(key: string, prefix: string = 'api'): Promise<void> {
  const cacheKey = `${prefix}:${key}`;
  const storage = useStorage('cache');
  await storage.removeItem(cacheKey);
}

/**
 * Clear all cached items with a specific prefix
 * @param prefix - Cache key prefix to clear
 */
export async function clearCachePrefix(prefix: string = 'api'): Promise<void> {
  const storage = useStorage('cache');
  const keys = await storage.getKeys(`${prefix}:`);

  await Promise.all(
    keys.map(key => storage.removeItem(key))
  );

  console.log(`Cache CLEARED for prefix: ${prefix} (${keys.length} items)`);
}
