import { scrapeSJ } from './scrape';

interface ScrapeQuery {
  from: string;
  to: string;
  date: string;
  noCache?: string;
  singleDeparture?: string;
}

/**
 * Streaming scrape endpoint using Server-Sent Events.
 * Sends progress updates as scraping happens.
 */
export default defineEventHandler(async(event) => {
  const query = getQuery(event) as ScrapeQuery;

  // Validate query parameters
  if (!query.from || !query.to || !query.date) {
    throw createError({
      statusCode: 400,
      message: 'Missing required parameters: from, to, date',
    });
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid date format. Expected YYYY-MM-DD',
    });
  }

  // Set up SSE
  const eventStream = createEventStream(event);

  // Check if debug options are allowed (only in local environment)
  const isLocal = (process.env.NUXT_PUBLIC_ENVIRONMENT === 'local');
  const noCache = (isLocal && query.noCache === '1');
  const singleDeparture = (isLocal && query.singleDeparture) ? query.singleDeparture : undefined;

  // Start async scraping process (don't await - let it run in background)
  (async() => {
    try {
      // Check route-level metadata cache first (unless noCache is enabled)
      const storage = useStorage('cache');
      const metaCacheKey = `sj:meta:${query.from}:${query.to}:${query.date}`;

      if (!noCache) {
        const metaCache = await storage.getItem<{
          total: number;
          departureTimes: string[];
          timestamp: number;
        }>(metaCacheKey);

        // If metadata exists and is recent (within 1 hour), load from individual caches
        if (metaCache?.timestamp && (Date.now() - metaCache.timestamp) < 3600000) {
          console.log(`✓ Route metadata cache HIT - loading ${metaCache.total} departures from cache`);

          // Load all departures from individual caches
          const cachedDepartures = [];
          for (const departureTime of metaCache.departureTimes) {
            const depCacheKey = `sj:dep:${query.from}:${query.to}:${query.date}:${departureTime}`;
            const cached = await storage.getItem<{ data: any; timestamp: number }>(depCacheKey);
            if (cached?.data) {
              cachedDepartures.push(cached.data);
              // Send individual departure
              await eventStream.push(JSON.stringify({
                type: 'departure',
                departure: cached.data,
              }));
            }
          }

          // Send complete event with cached data
          await eventStream.push(JSON.stringify({
            type: 'complete',
            data: {
              route: `${query.from} → ${query.to}`,
              date: query.date,
              scrapedAt: new Date(metaCache.timestamp).toISOString(),
              departures: cachedDepartures,
              stats: {
                clicksSaved: cachedDepartures.length,
                pagesVisited: 1,
              },
            },
          }));

          await eventStream.close();
          return;
        }
      }

      // No cached data available, start scraping
      console.log(`⚙️  ${noCache ? 'Cache DISABLED' : 'Route metadata cache MISS'} - starting scrape`);

      // Send initial status
      await eventStream.push(JSON.stringify({
        type: 'status',
        message: 'Öppnar SJ:s hemsida...',
      }));

      // Start scraping with progress updates
      const result = await scrapeSJ(
        query.from,
        query.to,
        query.date,
        async(current, total) => {
          // Send progress event
          await eventStream.push(JSON.stringify({
            type: 'progress',
            current,
            total,
          }));
        },
        async(departure) => {
          // Send individual departure as it's scraped
          await eventStream.push(JSON.stringify({
            type: 'departure',
            departure,
          }));
        },
        {
          noCache,
          singleDeparture,
        }
      );

      // Note: Individual departures are now cached in the scraper itself (granular caching)
      // No need to cache the full result here

      // Send completion event with data
      await eventStream.push(JSON.stringify({
        type: 'complete',
        data: result,
      }));

      await eventStream.close();
    }
    catch (error) {
      console.error('Streaming scrape error:', error);
      await eventStream.push(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
      await eventStream.close();
    }
  })();

  // Return the stream immediately to establish SSE connection
  return eventStream.send();
});
