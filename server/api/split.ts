import { findSplits } from '../utils/splitTicket';

interface SplitQuery {
  from: string;
  to: string;
  date: string;
  departureTime: string;
  noCache?: string;
}

/**
 * Split-ticket finder endpoint (hidden feature — see SPLIT.local.md).
 *
 * Streams progress over Server-Sent Events while it probes candidate split stations,
 * then sends the final result. Cache-first: a recent result completes instantly.
 */
export default defineEventHandler(async(event) => {
  const query = getQuery(event) as SplitQuery;

  if (!query.from || !query.to || !query.date || !query.departureTime) {
    throw createError({ statusCode: 400, message: 'Missing required parameters: from, to, date, departureTime' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    throw createError({ statusCode: 400, message: 'Invalid date format. Expected YYYY-MM-DD' });
  }
  if (!/^\d{2}:\d{2}$/.test(query.departureTime)) {
    throw createError({ statusCode: 400, message: 'Invalid departureTime format. Expected HH:MM' });
  }

  const isLocal = (process.env.NUXT_PUBLIC_ENVIRONMENT === 'local');
  const noCache = (isLocal && query.noCache === '1');

  const eventStream = createEventStream(event);

  (async() => {
    try {
      const result = await findSplits(
        query.from,
        query.to,
        query.date,
        query.departureTime,
        async(checked, total, found) => {
          await eventStream.push(JSON.stringify({ type: 'progress', checked, total, found }));
        },
        { noCache }
      );

      await eventStream.push(JSON.stringify({ type: 'complete', data: result }));
      await eventStream.close();
    } catch (error) {
      console.error('Split stream error:', error);
      await eventStream.push(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
      await eventStream.close();
    }
  })();

  return eventStream.send();
});
