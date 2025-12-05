/**
 * Cache management endpoint - clear cache by prefix
 * Only works in development for safety
 *
 * Usage:
 * - POST /api/cache/clear?prefix=geposit - Clear all geposit cache
 * - POST /api/cache/clear?prefix=cache-test - Clear test cache
 * - POST /api/cache/clear - Clear all 'api' prefix cache
 */

export default defineEventHandler(async(event) => {
  const config = useRuntimeConfig(event);

  // Only allow in development
  if (config.public.environment !== 'local') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cache clearing is only allowed in development',
    });
  }

  const query = getQuery(event);
  const prefix = (query.prefix as string) || 'api';

  await clearCachePrefix(prefix);

  return {
    success: true,
    message: `Cache cleared for prefix: ${prefix}`,
    prefix,
  };
});
