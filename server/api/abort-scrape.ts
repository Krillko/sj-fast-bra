/**
 * API endpoint to abort an ongoing scrape operation.
 * Only works in local environment for debugging purposes.
 */
export default defineEventHandler(async(event) => {
  // Only allow in local environment
  const isLocal = (process.env.NUXT_PUBLIC_ENVIRONMENT === 'local');
  if (!isLocal) {
    throw createError({
      statusCode: 403,
      message: 'Abort functionality is only available in local environment',
    });
  }

  const query = getQuery(event);

  // Validate query parameters
  if (!query.from || !query.to || !query.date) {
    throw createError({
      statusCode: 400,
      message: 'Missing required parameters: from, to, date',
    });
  }

  try {
    const storage = useStorage('cache');
    const abortKey = `abort:${query.from}:${query.to}:${query.date}`;

    // Set abort signal in cache
    await storage.setItem(abortKey, true, {
      ttl: 300, // Expire after 5 minutes
    });

    console.log(`🛑 Abort signal set for: ${query.from} → ${query.to} on ${query.date}`);

    return {
      success: true,
      message: 'Abort signal sent. Scraper will stop after current departure.',
    };
  } catch (error) {
    console.error('Error setting abort signal:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to set abort signal',
    });
  }
});
