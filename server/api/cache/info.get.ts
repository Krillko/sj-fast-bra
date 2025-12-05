/**
 * Cache info endpoint - view all cached keys
 * Only works in development for safety
 *
 * Usage:
 * - /api/cache/info - View all cached keys
 * - /api/cache/info?prefix=geposit - View keys with specific prefix
 */

export default defineEventHandler(async(event) => {
  const config = useRuntimeConfig(event);

  // Only allow in development
  if (config.public.environment !== 'local') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cache info is only available in development',
    });
  }

  const query = getQuery(event);
  const prefix = query.prefix as string;

  const storage = useStorage('cache');
  const keys = await storage.getKeys(prefix || '');

  // Get details for each key
  const items = await Promise.all(
    keys.map(async(key) => {
      const data = await storage.getItem<{ timestamp: number; data: any }>(key);
      const age = data?.timestamp ? Date.now() - data.timestamp : null;

      return {
        key,
        age: age ? Math.round(age / 1000) : null,
        ageFormatted: age ? `${Math.round(age / 1000)}s` : 'unknown',
        hasData: !!data,
      };
    })
  );

  return {
    count: keys.length,
    items,
    filter: prefix || 'none',
  };
});
