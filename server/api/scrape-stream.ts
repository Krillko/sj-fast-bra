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
