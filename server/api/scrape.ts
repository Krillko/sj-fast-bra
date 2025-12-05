import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { acceptCookies, randomDelay, scrollToBottom } from '../utils/puppeteer';

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
  prices: {
    secondClass: PriceInfo;
    secondClassCalm: PriceInfo;
    firstClass: PriceInfo;
  };
  bookingUrl: string;
}

interface ScrapeResult {
  route: string;
  date: string;
  scrapedAt: string;
  departures: Departure[];
}

/**
 * Extracts departure card data from the results page.
 */
async function extractDepartureCards(page: Page): Promise<Array<{
  departureTime: string;
  arrivalTime: string;
  duration: string;
  changes: number;
  cardIndex: number;
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

      // Extract duration (look for patterns like "4 h 30 min")
      const durationMatch = html.match(/(\d+\s*h(?:\s*\d+\s*min)?)/i);
      const duration = durationMatch ? durationMatch[0] : '';

      // Extract changes (look for "0 change", "1 change", or "Direct")
      const changesMatch = html.match(/(\d+)\s*change/i);
      const changes = changesMatch ? Number.parseInt(changesMatch[1], 10) : 0;

      return {
        departureTime,
        arrivalTime,
        duration,
        changes,
        cardIndex: index,
      };
    });
  });
}

/**
 * Extracts price information from the ticket selection page.
 */
async function extractPrices(page: Page): Promise<{
  secondClass: PriceInfo;
  secondClassCalm: PriceInfo;
  firstClass: PriceInfo;
}> {
  return page.evaluate(() => {
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

    return {
      secondClass: extractPrice('SECOND-price'),
      secondClassCalm: extractPrice('SECOND_CALM-price'),
      firstClass: extractPrice('FIRST-price'),
    };
  });
}

/**
 * Main scraping function.
 */
async function scrapeSJ(from: string, to: string, date: string): Promise<ScrapeResult> {
  let browser: Browser | null = null;

  try {
    console.log(`🚂 Starting scrape: ${from} → ${to} on ${date}`);

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to results page
    const url = `https://www.sj.se/en/search-journey/choose-journey/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date}`;
    console.log(`Navigating to: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

    // Accept cookies
    await acceptCookies(page);

    // Wait for departure cards to load
    await page.waitForSelector('[data-testid]', { timeout: 10000 });
    await randomDelay(1000, 2000);

    // Scroll to load all departures
    console.log('Scrolling to load all departures...');
    await scrollToBottom(page);

    // Extract departure card data
    console.log('Extracting departure cards...');
    const departureCards = await extractDepartureCards(page);
    console.log(`Found ${departureCards.length} departures`);

    // Scrape each departure
    const departures: Departure[] = [];

    for (let i = 0; i < departureCards.length; i++) {
      const card = departureCards[i];
      console.log(`Processing departure ${i + 1}/${departureCards.length}: ${card.departureTime} → ${card.arrivalTime}`);

      try {
        // Get the button inside the card and click it
        const buttonHandle = await page.evaluateHandle((index: number) => {
          const cards = document.querySelectorAll('[data-testid*="-"]');
          const departureCards = Array.from(cards).filter((card) => {
            const testId = card.getAttribute('data-testid');
            return testId && testId.match(/^[0-9a-f-]{36}$/);
          });

          const card = departureCards[index];
          if (!card) return null;

          // Find the button inside the card
          const button = card.querySelector('button');
          return button;
        }, i);

        if (!buttonHandle) {
          console.error(`Button in card ${i} not found`);
          continue;
        }

        // Click the button and wait for page to load
        await buttonHandle.click();
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Extract prices
        const prices = await extractPrices(page);

        // Construct booking URL
        const bookingUrl = `https://www.sj.se/en/search-journey/choose-ticket-type/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date}/outward-journey`;

        // Add to results
        departures.push({
          departureTime: card.departureTime,
          arrivalTime: card.arrivalTime,
          duration: card.duration,
          changes: card.changes,
          prices,
          bookingUrl,
        });

        // Navigate back to results page
        await page.goBack();
        await page.waitForSelector('[data-testid]', { timeout: 10000 });
        await randomDelay(500, 1000);
      } catch (error) {
        console.error(`Error processing departure ${i + 1}:`, error);
        // Continue with next departure
      }
    }

    console.log(`✓ Scraping complete. Found ${departures.length} departures with prices`);

    return {
      route: `${from} → ${to}`,
      date,
      scrapedAt: new Date().toISOString(),
      departures,
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
    const result = await scrapeSJ(query.from, query.to, query.date);
    return result;
  } catch (error) {
    console.error('Scraping error:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to scrape train data',
    });
  }
});
