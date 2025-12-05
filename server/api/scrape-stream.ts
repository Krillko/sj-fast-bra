import { scrapeSJ } from './scrape';

interface ScrapeQuery {
  from: string;
  to: string;
  date: string;
}

/**
 * Streaming scrape endpoint using Server-Sent Events.
 * Sends progress updates as scraping happens.
 */
export default defineEventHandler(async (event) => {
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

  // Start async scraping process (don't await - let it run in background)
  (async () => {
    try {
      // Send initial status
      await eventStream.push(JSON.stringify({
        type: 'status',
        message: 'Checking cache...',
      }));

      // Check cache first
      const cacheKey = `${query.from}:${query.to}:${query.date}`;
      const cachedData = await useStorage('cache').getItem(`sj:${cacheKey}`);

      // If cached, send it immediately as an event and close
      if (cachedData) {
        await eventStream.push(JSON.stringify({
          type: 'status',
          message: 'Loading cached data...',
        }));

        // Handle old cache format that wrapped data with extra layer
        const actualData = cachedData.data ? cachedData.data : cachedData;

        await eventStream.push(JSON.stringify({
          type: 'complete',
          data: actualData,
        }));

        await eventStream.close();
        return;
      }

      // Not cached, start scraping
      await eventStream.push(JSON.stringify({
        type: 'status',
        message: 'Öppnar SJ:s hemsida...',
      }));

      // Start scraping with progress updates
      const result = await scrapeSJ(
        query.from,
        query.to,
        query.date,
        async (current, total) => {
          // Send progress event
          await eventStream.push(JSON.stringify({
            type: 'progress',
            current,
            total,
          }));
        },
      );

      // Cache the result
      await useStorage('cache').setItem(`sj:${cacheKey}`, result, {
        ttl: 86400, // 24 hours
      });

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
