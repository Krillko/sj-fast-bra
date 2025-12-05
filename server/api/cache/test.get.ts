/**
 * Cache testing endpoint
 * Test cache functionality with different TTL values
 *
 * Usage:
 * - /api/cache/test?key=mykey - Test basic caching (60s TTL)
 * - /api/cache/test?key=mykey&ttl=10 - Test with custom TTL
 */

export default defineEventHandler(async(event) => {
  const query = getQuery(event);
  const key = (query.key as string) || 'test';
  const ttl = Number(query.ttl) || 60;

  return useCache(
    key,
    async() => {
      // Simulate slow operation
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        message: 'This response was generated fresh',
        timestamp: new Date().toISOString(),
        key,
        ttl,
      };
    },
    { ttl, prefix: 'cache-test' }
  );
});
