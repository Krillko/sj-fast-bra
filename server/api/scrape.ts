import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { acceptCookies, scrollToBottom } from '../utils/puppeteer';

interface ScrapeQuery {
  from: string;
  to: string;
  date: string;
}

interface PriceInfo {
  price: number | null;
  available: boolean;
}

interface Departure {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  changes: number;
  operator: string;
  prices: {
    secondClass: PriceInfo;
    secondClassCalm: PriceInfo;
    firstClass: PriceInfo;
  };
  bookingUrl: string;
}

interface DepartureTiming {
  departureTime: string;
  cacheCheck: number;
  navigate: number;
  extract: number;
  cacheWrite: number;
  navigateBack: number;
  total: number;
  fromCache: boolean;
  failed: boolean;
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
  timings?: {
    departures: DepartureTiming[];
    totalTime: number;
    scrollTime: number;
    averagePerDeparture: number;
  };
}

/**
 * Extracts departure card data from the results page.
 */
async function extractDepartureCards(page: Page): Promise<Array<{
  departureTime: string;
  arrivalTime: string;
  duration: string;
  changes: number;
  operator: string;
  cardIndex: number;
  detailUrl?: string;
}>> {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('[data-testid*="-"]');
    const departureCards = Array.from(cards).filter((card) => {
      const testId = card.getAttribute('data-testid');
      return testId && testId.match(/^[0-9a-f-]{36}$/);
    });

    return departureCards.map((card, index) => {
      const html = card.innerHTML;

      // Extract times (look for patterns like "06:00" or "10:30")
      const timeMatches = html.match(/\d{2}:\d{2}/g);
      const departureTime = timeMatches?.[0] || '';
      const arrivalTime = timeMatches?.[1] || '';

      // Calculate precise duration from departure and arrival times
      let duration = '';
      if (departureTime && arrivalTime) {
        const [depHours, depMinutes] = departureTime.split(':').map(Number);
        const [arrHours, arrMinutes] = arrivalTime.split(':').map(Number);

        const depTotalMinutes = (depHours * 60) + depMinutes;
        let arrTotalMinutes = (arrHours * 60) + arrMinutes;

        // Handle overnight trips (arrival time is next day)
        if (arrTotalMinutes < depTotalMinutes) {
          arrTotalMinutes += (24 * 60);
        }

        const durationMinutes = arrTotalMinutes - depTotalMinutes;
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;

        if (minutes === 0) {
          duration = `${hours} h`;
        }
        else {
          duration = `${hours} h ${minutes} min`;
        }
      }

      // Extract changes (look for "0 change", "1 change", or "Direct")
      const changesMatch = html.match(/(\d+)\s*change/i);
      const changes = changesMatch ? Number.parseInt(changesMatch[1], 10) : 0;

      // Extract operator (look for operator names)
      // The operator is usually displayed near the top of the card
      let operator = '';

      // Try to find operator in data attributes first
      const operatorDataAttr = card.querySelector('[data-operator]');
      if (operatorDataAttr) {
        operator = operatorDataAttr.getAttribute('data-operator') || '';
      }

      // If not found, try regex patterns
      if (!operator) {
        const operatorPatterns = [
          /SJ\s+(High|Night|Regional|Intercity|Express)/i,
          /SJ(?!\s)/i, // SJ alone
          /Mälartåg/i,
          /Öresundståg/i,
          /Snälltåget/i,
          /Tågab/i,
          /Arriva/i,
          /Vy\s+Tåg/i,
          /MTR\s+Express/i,
          /FlixTrain/i,
        ];

        for (const pattern of operatorPatterns) {
          const operatorMatch = html.match(pattern);
          if (operatorMatch) {
            operator = operatorMatch[0].trim();
            break;
          }
        }
      }

      // If still not found, try to extract from card structure
      if (!operator) {
        // Look for text that might be an operator near the departure time
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Look for spans or divs that might contain operator info
        const possibleOperatorElements = tempDiv.querySelectorAll('span, div');
        for (const el of Array.from(possibleOperatorElements)) {
          const text = el.textContent?.trim() || '';
          // Check if it looks like an operator (not a time, not a number, not too long)
          if (text && text.length < 30 && !/\d{2}:\d{2}/.test(text) && !/^\d+$/.test(text)) {
            // Check if it contains train-related keywords
            if (/tåg|train|SJ|express|regional/i.test(text)) {
              operator = text;
              break;
            }
          }
        }
      }

      // Log if operator is still empty for debugging
      if (!operator && typeof console !== 'undefined') {
        console.warn(`Could not extract operator for departure ${departureTime} → ${arrivalTime}. Card HTML sample:`, html.substring(0, 200));
      }

      // Try to extract the link/button href if available
      let detailUrl: string | undefined;
      const link = card.querySelector('a[href]');
      const button = card.querySelector('button');

      if (link) {
        detailUrl = link.getAttribute('href') || undefined;
      } else if (button) {
        // Button doesn't have href, we'll need to click it
        detailUrl = undefined;
      }

      return {
        departureTime,
        arrivalTime,
        duration,
        changes,
        operator,
        cardIndex: index,
        detailUrl,
      };
    });
  });
}

/**
 * Extracts price information from the ticket selection page.
 */
async function extractPrices(page: Page, debugMode = false): Promise<{
  secondClass: PriceInfo;
  secondClassCalm: PriceInfo;
  firstClass: PriceInfo;
  debugInfo?: {
    allPriceTestIds: string[];
    allTestIds: string[];
  };
}> {
  const result = await page.evaluate((debug: boolean) => {
    const extractPrice = (testId: string): PriceInfo => {
      const priceElement = document.querySelector(`[data-testid="${testId}"]`);

      if (!priceElement) {
        return { price: null, available: false };
      }

      // Check if unavailable
      const parentCard = priceElement.closest('[data-testid]')?.parentElement;
      const isUnavailable = parentCard?.textContent?.includes('Unavailable') || false;

      if (isUnavailable) {
        return { price: null, available: false };
      }

      // Extract price number (format: "Fr. 1,935 SEK")
      const priceText = priceElement.textContent || '';
      const priceMatch = priceText.match(/[\d,]+/);

      if (!priceMatch) {
        return { price: null, available: false };
      }

      // Remove comma thousands separator and parse
      const price = Number.parseInt(priceMatch[0].replace(/,/g, ''), 10);

      return {
        price: Number.isNaN(price) ? null : price,
        available: true,
      };
    };

    // Collect debug info if requested
    let debugInfo;
    if (debug) {
      const allTestIds = Array.from(document.querySelectorAll('[data-testid]'))
        .map((el) => el.getAttribute('data-testid'))
        .filter((id) => id) as string[];
      const allPriceTestIds = allTestIds.filter((id) => id.toLowerCase().includes('price'));

      debugInfo = {
        allPriceTestIds,
        allTestIds: allTestIds.slice(0, 50), // Limit to first 50 to avoid huge output
      };
    }

    const prices = {
      secondClass: extractPrice('SECOND-price'),
      secondClassCalm: extractPrice('SECOND_CALM-price'),
      firstClass: extractPrice('FIRST-price'),
    };

    // Fallback for regional trains: check for 'totalPrice' testid
    if (!prices.secondClass.available && !prices.secondClassCalm.available && !prices.firstClass.available) {
      const totalPrice = extractPrice('totalPrice');
      if (totalPrice.available) {
        // Regional trains typically only have one price (second class)
        prices.secondClass = totalPrice;
      }
    }

    return {
      ...prices,
      debugInfo,
    };
  }, debugMode);

  // Log debug info server-side
  if (debugMode && result.debugInfo) {
    console.log('🔍 Available price testids:', result.debugInfo.allPriceTestIds);
    console.log('📋 All testids (first 50):', result.debugInfo.allTestIds);
  }

  return result;
}

/**
 * Main scraping function with progress callback and granular caching.
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
  let browser: Browser | null = null;
  const storage = useStorage('cache');
  const config = useRuntimeConfig();
  const timeouts = config.scraper.timeouts;

  // Track timing data
  const timingData: DepartureTiming[] = [];
  const scrapeStartTime = Date.now();
  let scrollTime = 0;

  // Abort signal key
  const abortKey = `abort:${from}:${to}:${date}`;

  try {
    console.log(`🚂 Starting scrape: ${from} → ${to} on ${date}`);

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Block only images, fonts, and media (keep stylesheets for proper rendering)
      if (['image', 'font', 'media'].includes(resourceType)) {
        request.abort();
      }
      else {
        request.continue();
      }
    });

    // Navigate to results page
    const url = `https://www.sj.se/en/search-journey/choose-journey/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date}`;
    console.log(`Navigating to: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle0', timeout: timeouts.initialPageLoad });

    // Accept cookies
    await acceptCookies(page);

    // Wait for departure cards to load
    await page.waitForSelector('[data-testid]', { timeout: timeouts.selectorWait });

    // Scroll to load all departures (fast scroll with 300ms delays)
    console.log('Scrolling to load all departures...');
    const scrollStart = Date.now();
    await scrollToBottom(page, { scrollDelay: 300, maxScrollTime: 10000 });
    scrollTime = Date.now() - scrollStart;

    // Extract departure card data
    console.log('Extracting departure cards...');
    const allDepartureCards = await extractDepartureCards(page);
    console.log(`Found ${allDepartureCards.length} departures`);

    // Debug: Show all departure times found
    if (options?.singleDeparture || allDepartureCards.length < 5) {
      console.log('Departure times found:', allDepartureCards.map((c) => c.departureTime).join(', '));
    }

    // Filter out already departed trains
    const now = new Date();
    const [year, month, day] = date.split('-').map(Number);

    const departureCards = allDepartureCards.filter((card) => {
      const [hours, minutes] = card.departureTime.split(':').map(Number);
      const departureDateTime = new Date(year, month - 1, day, hours, minutes);

      // Add a small buffer (5 minutes) to avoid edge cases
      const isUpcoming = departureDateTime.getTime() > (now.getTime() - 5 * 60 * 1000);

      if (!isUpcoming) {
        console.log(`⏭️  Skipping already departed train: ${card.departureTime}`);
      }

      return isUpcoming;
    });

    console.log(`${departureCards.length} upcoming departures (${allDepartureCards.length - departureCards.length} already departed)`);

    // Filter to single departure if requested
    let cardsToProcess = departureCards;
    if (options?.singleDeparture) {
      cardsToProcess = departureCards.filter((card) => card.departureTime === options.singleDeparture);
      if (cardsToProcess.length === 0) {
        console.warn(`⚠️  No departure found matching time: ${options.singleDeparture}`);
      }
      else {
        console.log(`🎯 Single departure mode: processing only ${options.singleDeparture}`);
      }
    }

    // Notify about total count
    if (onProgress) {
      onProgress(0, cardsToProcess.length);
    }

    // Scrape each departure sequentially with granular caching
    const departures: Departure[] = [];
    let skippedCount = 0;
    let cacheHits = 0;
    const failedDepartures: string[] = []; // Track which departures failed
    let aborted = false;

    for (let i = 0; i < cardsToProcess.length; i++) {
      const card = cardsToProcess[i];
      const departureStartTime = Date.now();

      // Check for abort signal (only in local environment)
      const isLocal = (process.env.NUXT_PUBLIC_ENVIRONMENT === 'local');
      if (isLocal) {
        const abortSignal = await storage.getItem<boolean>(abortKey);
        if (abortSignal) {
          console.log(`\n🛑 Abort signal received. Stopping after ${i} departures.`);
          aborted = true;
          // Clear abort signal
          await storage.removeItem(abortKey);
          break;
        }
      }

      console.log(`\n⏱️  Processing departure ${i + 1}/${cardsToProcess.length}: ${card.departureTime} → ${card.arrivalTime}`);

      // Report progress
      if (onProgress) {
        onProgress(i, cardsToProcess.length);
      }

      // Initialize timing for this departure
      const timing: DepartureTiming = {
        departureTime: card.departureTime,
        cacheCheck: 0,
        navigate: 0,
        extract: 0,
        cacheWrite: 0,
        navigateBack: 0,
        total: 0,
        fromCache: false,
        failed: false,
      };

      // Check cache for this specific departure (skip if noCache is enabled)
      const cacheCheckStart = Date.now();
      const depCacheKey = `sj:dep:${from}:${to}:${date}:${card.departureTime}`;
      let cachedDeparture: { data: Departure; timestamp: number } | null = null;

      if (!options?.noCache) {
        cachedDeparture = await storage.getItem<{ data: Departure; timestamp: number }>(depCacheKey);
      }
      const cacheCheckTime = Date.now() - cacheCheckStart;

      // Check if cached and still valid (1 hour TTL)
      if (cachedDeparture?.timestamp && !options?.noCache) {
        const age = Date.now() - cachedDeparture.timestamp;
        if (age < 3600000) { // 1 hour in milliseconds
          timing.cacheCheck = cacheCheckTime;
          timing.total = Date.now() - departureStartTime;
          timing.fromCache = true;
          timingData.push(timing);

          console.log(`✓ Cache HIT for ${card.departureTime} (${Math.round(age / 60000)}min old) - check: ${cacheCheckTime}ms, total: ${timing.total}ms`);
          departures.push(cachedDeparture.data);
          cacheHits++;

          // Send cached departure immediately
          if (onDeparture) {
            onDeparture(cachedDeparture.data);
          }

          // Report progress
          if (onProgress) {
            onProgress(i + 1, cardsToProcess.length);
          }

          continue;
        }
      }

      console.log(`⚙️  Cache ${options?.noCache ? 'DISABLED' : 'MISS'} for ${card.departureTime} (${cacheCheckTime}ms), scraping...`);
      timing.cacheCheck = cacheCheckTime;

      try {
        // Click to navigate to departure details
        // Find the card fresh each time by matching departure time (avoid stale DOM references)
        const navStart = Date.now();

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeouts.navigationClick }),
          page.evaluate((departureTime: string) => {
            // Find all departure cards
            const cards = document.querySelectorAll('[data-testid*="-"]');
            const departureCards = Array.from(cards).filter((card) => {
              const testId = card.getAttribute('data-testid');
              return testId && testId.match(/^[0-9a-f-]{36}$/);
            });

            // Find the card that matches this departure time
            for (const card of departureCards) {
              const html = card.innerHTML;
              const timeMatches = html.match(/\d{2}:\d{2}/g);
              if (timeMatches && timeMatches[0] === departureTime) {
                const button = card.querySelector('button');
                if (!button) throw new Error('Button not found');
                (button as HTMLButtonElement).click();
                return;
              }
            }
            throw new Error(`Card for ${departureTime} not found`);
          }, card.departureTime),
        ]);

        timing.navigate = Date.now() - navStart;
        console.log(`  ├─ Navigate to details: ${timing.navigate}ms`);

        // Extract prices (enable debug mode if single departure)
        const extractStart = Date.now();
        const prices = await extractPrices(page, !!options?.singleDeparture);
        timing.extract = Date.now() - extractStart;
        console.log(`  ├─ Extract prices: ${timing.extract}ms`);

        // Debug logging for single departure mode
        if (options?.singleDeparture) {
          console.log(`💰 Extracted prices for ${card.departureTime}:`, JSON.stringify(prices, null, 2));
        }

        // Construct booking URL
        const bookingUrl = page.url();

        // Add to results
        const departure: Departure = {
          departureTime: card.departureTime,
          arrivalTime: card.arrivalTime,
          duration: card.duration,
          changes: card.changes,
          operator: card.operator,
          prices,
          bookingUrl,
        };

        departures.push(departure);

        // Cache this individual departure
        const cacheWriteStart = Date.now();
        const depCacheKey = `sj:dep:${from}:${to}:${date}:${card.departureTime}`;
        await storage.setItem(depCacheKey, {
          data: departure,
          timestamp: Date.now(),
        });
        timing.cacheWrite = Date.now() - cacheWriteStart;
        console.log(`  ├─ Cache write: ${timing.cacheWrite}ms`);

        // Send individual departure if callback provided
        if (onDeparture) {
          onDeparture(departure);
        }

        // Report progress after processing
        if (onProgress) {
          onProgress(i + 1, cardsToProcess.length);
        }

        // Navigate back to results page (reload for fresh DOM)
        const backStart = Date.now();
        const url = `https://www.sj.se/en/search-journey/choose-journey/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date}`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: timeouts.navigateBack });
        // Wait for departure cards to be present and interactive
        await page.waitForSelector('[data-testid]', { timeout: timeouts.selectorAfterBack });
        // Scroll to bottom with FAST delays (300ms) to trigger lazy loading quickly
        console.log('  ├─ Fast scrolling to load all cards...');
        await scrollToBottom(page, { scrollDelay: 300, maxScrollTime: 10000 });
        timing.navigateBack = Date.now() - backStart;
        console.log(`  ├─ Navigate back (reload + fast scroll): ${timing.navigateBack}ms`);

        timing.total = Date.now() - departureStartTime;
        timingData.push(timing);
        console.log(`  └─ Total for ${card.departureTime}: ${timing.total}ms (${(timing.total / 1000).toFixed(1)}s)`);

        // No artificial delay needed - navigation waits ensure page is ready
      }
      catch (error) {
        skippedCount++;
        failedDepartures.push(card.departureTime); // Track failed departure
        timing.total = Date.now() - departureStartTime;
        timing.failed = true;
        timingData.push(timing);
        console.error(`❌ Error processing departure ${i + 1}/${cardsToProcess.length} (${card.departureTime} → ${card.arrivalTime}) after ${timing.total}ms:`, error);

        // Stop on first error if flag is set (local environment only)
        const isLocal = (process.env.NUXT_PUBLIC_ENVIRONMENT === 'local');
        if (isLocal && config.scraper.stopOnFirstError) {
          console.log(`🛑 Stopping at first error (stopOnFirstError flag is enabled)`);
          break;
        }
        // Continue with next departure
      }
    }

    if (skippedCount > 0) {
      console.warn(`⚠️  Skipped ${skippedCount} departures due to errors`);
    }

    const scraped = departures.length - cacheHits;
    const totalTime = Date.now() - scrapeStartTime;

    // Calculate timing statistics
    const totalDepartureTime = timingData.reduce((sum, t) => sum + t.total, 0);
    const averagePerDeparture = timingData.length > 0 ? totalDepartureTime / timingData.length : 0;

    console.log(`✓ Scraping ${aborted ? 'ABORTED' : 'complete'}. Total: ${departures.length} departures (${cacheHits} from cache, ${scraped} scraped, ${skippedCount} skipped)`);
    console.log(`⏱️  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s), Average per departure: ${Math.round(averagePerDeparture)}ms`);

    // Determine if results are incomplete
    const isIncomplete = (skippedCount > 0);

    // Store route metadata for future quick lookups
    const metaCacheKey = `sj:meta:${from}:${to}:${date}`;
    await storage.setItem(metaCacheKey, {
      total: departures.length,
      departureTimes: departures.map((d) => d.departureTime),
      timestamp: Date.now(),
      incomplete: isIncomplete,
      failedDepartures: isIncomplete ? failedDepartures : [],
    });

    // Save timing data to cache
    const timingKey = `sj:timing:${from}:${to}:${date}:${Date.now()}`;
    const timingResult = {
      route: `${from} → ${to}`,
      date,
      timestamp: new Date().toISOString(),
      totalTime,
      scrollTime,
      averagePerDeparture,
      aborted,
      departures: timingData,
    };
    await storage.setItem(timingKey, timingResult, {
      ttl: 86400, // Keep for 24 hours
    });
    console.log(`💾 Timing data saved to cache: ${timingKey}`);

    // Calculate stats
    const clicksSaved = departures.length;
    const pagesVisited = 1 + scraped; // 1 results page + 1 page per scraped departure

    return {
      route: `${from} → ${to}`,
      date,
      scrapedAt: new Date().toISOString(),
      departures,
      stats: {
        clicksSaved,
        pagesVisited,
      },
      incomplete: isIncomplete,
      failedCount: skippedCount,
      aborted,
      timings: {
        departures: timingData,
        totalTime,
        scrollTime,
        averagePerDeparture,
      },
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * API endpoint handler.
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

  try {
    // Use cache with 24 hour TTL
    const cacheKey = `${query.from}:${query.to}:${query.date}`;
    const result = await useCache(
      cacheKey,
      async() => {
        return await scrapeSJ(query.from, query.to, query.date);
      },
      {
        ttl: 86400, // 24 hours in seconds
        prefix: 'sj',
      }
    );

    return result;
  } catch (error) {
    console.error('Scraping error:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to scrape train data',
    });
  }
});
