import {
  createSearch,
  getDepartures,
  getOffers,
  buildBookingUrl,
  type Departure
} from '../utils/sjApi';
import { resolveStationCode } from '../utils/stations';

interface ScrapeQuery {
  from: string;
  to: string;
  date: string;
}

interface ScrapeResult {
  route: string;
  date: string;
  scrapedAt: string;
  departures: Departure[];
  stats: {
    clicksSaved: number;
    pagesVisited: number;
  };
  incomplete?: boolean;
  failedCount?: number;
  aborted?: boolean;
}

interface CachedDeparture {
  data: Departure;
  timestamp: number;
}

const DEPARTURE_TTL_MS = 3600000; // 1 hour

/**
 * Fetch train departures with prices for a route via the SJ booking API.
 *
 * This replaces the previous Puppeteer scraper entirely (see HISTORY.md):
 * three JSON calls instead of a headless browser, returning all departures in a
 * couple of seconds with no per-IP request limit.
 *
 * The signature, result shape, granular per-departure caching, and the
 * onProgress/onDeparture callbacks are kept identical so the SSE endpoint and
 * UI are unaffected.
 */
export async function scrapeSJ(
  from: string,
  to: string,
  date: string,
  onProgress?: (current: number, total: number) => void,
  onDeparture?: (departure: Departure) => void,
  options?: {
    noCache?: boolean;
    singleDeparture?: string;
  }
): Promise<ScrapeResult> {
  const storage = useStorage('cache');
  const config = useRuntimeConfig();
  const concurrency = config.sj?.offersConcurrency ?? 5;
  const startTime = Date.now();

  console.log(`🚂 Fetching ${from} → ${to} on ${date} via SJ API`);

  const originUic = resolveStationCode(from);
  const destinationUic = resolveStationCode(to);

  // 1. Create a search session and 2. get the full departure list.
  const { departureSearchId, passengerListId } = await createSearch(originUic, destinationUic, date);
  const allStubs = await getDepartures(departureSearchId);
  console.log(`Found ${allStubs.length} departures (${Date.now() - startTime}ms)`);

  // Filter out trains that have already departed (with a 5-minute buffer).
  const now = Date.now();
  const [year, month, day] = date.split('-').map(Number);
  let stubs = allStubs.filter((stub) => {
    const [hours, minutes] = stub.departureTime.split(':').map(Number);
    const departureMs = new Date(year, month - 1, day, hours, minutes).getTime();
    const upcoming = departureMs > now - 5 * 60 * 1000;
    if (!upcoming) console.log(`⏭️  Skipping already departed train: ${stub.departureTime}`);
    return upcoming;
  });

  // Local debug: limit to a single departure time.
  if (options?.singleDeparture) {
    stubs = stubs.filter((s) => s.departureTime === options.singleDeparture);
    console.log(`🎯 Single departure mode: ${options.singleDeparture} (${stubs.length} match)`);
  }

  if (onProgress) onProgress(0, stubs.length);

  const bookingUrl = buildBookingUrl(from, to, date);
  const departures: Departure[] = new Array(stubs.length);
  const failed: string[] = [];
  let cacheHits = 0;
  let completed = 0;

  // Process each departure: cache check, then fetch offers if needed.
  // Runs with bounded concurrency to fetch prices in parallel while staying polite.
  const processStub = async(stub: typeof stubs[number], index: number): Promise<void> => {
    const cacheKey = `sj:dep:${from}:${to}:${date}:${stub.departureTime}`;

    if (!options?.noCache) {
      const cached = await storage.getItem<CachedDeparture>(cacheKey);
      if (cached?.timestamp && now - cached.timestamp < DEPARTURE_TTL_MS) {
        departures[index] = cached.data;
        cacheHits++;
        if (onDeparture) onDeparture(cached.data);
        if (onProgress) onProgress(++completed, stubs.length);
        return;
      }
    }

    const prices = await getOffers(stub.departureId, passengerListId);
    if (!prices) {
      failed.push(stub.departureTime);
      if (onProgress) onProgress(++completed, stubs.length);
      return;
    }

    const departure: Departure = {
      departureTime: stub.departureTime,
      arrivalTime: stub.arrivalTime,
      duration: stub.duration,
      changes: stub.changes,
      operator: stub.operator,
      prices,
      bookingUrl,
    };

    departures[index] = departure;
    await storage.setItem(cacheKey, { data: departure, timestamp: Date.now() });
    if (onDeparture) onDeparture(departure);
    if (onProgress) onProgress(++completed, stubs.length);
  };

  // Simple concurrency pool over the departure indexes.
  let cursor = 0;
  const worker = async(): Promise<void> => {
    while (cursor < stubs.length) {
      const index = cursor++;
      await processStub(stubs[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, stubs.length) }, worker));

  // Drop holes left by failed departures while preserving order.
  const result = departures.filter(Boolean);
  const scraped = result.length - cacheHits;
  const incomplete = failed.length > 0;

  console.log(
    `✓ Done in ${Date.now() - startTime}ms: ${result.length} departures `
    + `(${cacheHits} cached, ${scraped} fetched, ${failed.length} failed)`
  );
  if (incomplete) console.warn(`⚠️  Failed departures: ${failed.join(', ')}`);

  // Store route metadata for the fast cache-load path in scrape-stream.ts.
  const metaCacheKey = `sj:meta:${from}:${to}:${date}`;
  await storage.setItem(metaCacheKey, {
    total: result.length,
    departureTimes: result.map((d) => d.departureTime),
    timestamp: Date.now(),
    incomplete,
    failedDepartures: incomplete ? failed : [],
  });

  return {
    route: `${from} → ${to}`,
    date,
    scrapedAt: new Date().toISOString(),
    departures: result,
    stats: {
      clicksSaved: result.length,
      pagesVisited: 1, // a single API session instead of one page load per departure
    },
    incomplete,
    failedCount: failed.length,
  };
}

/**
 * API endpoint handler.
 */
export default defineEventHandler(async(event) => {
  const query = getQuery(event) as ScrapeQuery;

  if (!query.from || !query.to || !query.date) {
    throw createError({ statusCode: 400, message: 'Missing required parameters: from, to, date' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    throw createError({ statusCode: 400, message: 'Invalid date format. Expected YYYY-MM-DD' });
  }

  try {
    const cacheKey = `${query.from}:${query.to}:${query.date}`;
    return await useCache(
      cacheKey,
      async() => scrapeSJ(query.from, query.to, query.date),
      { ttl: 86400, prefix: 'sj' }
    );
  } catch (error) {
    console.error('SJ API error:', error);
    throw createError({ statusCode: 500, message: 'Failed to fetch train data' });
  }
});
