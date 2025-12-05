import puppeteer from 'puppeteer';

console.log('🧪 Testing scroll utility...\n');

/**
 * Scrolls to the bottom of a page incrementally to trigger lazy loading.
 */
async function scrollToBottom(page, options = {}) {
  const {
    scrollDelay = 500,
    maxScrollTime = 30000,
    maxScrollAttempts = 50,
  } = options;

  const startTime = Date.now();

  await page.evaluate(async (scrollDelayMs, maxTime, maxAttempts) => {
    await new Promise((resolve) => {
      let lastHeight = document.body.scrollHeight;
      let attemptCount = 0;
      const startMs = Date.now();

      const scrollInterval = setInterval(() => {
        // Check timeout conditions
        if (Date.now() - startMs > maxTime || attemptCount >= maxAttempts) {
          clearInterval(scrollInterval);
          resolve();
          return;
        }

        // Scroll to bottom
        window.scrollTo(0, document.body.scrollHeight);
        attemptCount++;

        // Check if new content loaded
        const newHeight = document.body.scrollHeight;
        if (newHeight === lastHeight) {
          // No new content, we're done
          clearInterval(scrollInterval);
          resolve();
        } else {
          lastHeight = newHeight;
        }
      }, scrollDelayMs);
    });
  }, scrollDelay, maxScrollTime, maxScrollAttempts);

  const elapsedTime = Date.now() - startTime;
  console.log(`✓ Scrolling complete. Took ${elapsedTime}ms`);
}

/**
 * Accepts cookie consent dialog on SJ.se if present.
 */
async function acceptCookies(page, timeout = 5000) {
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button'))
        .find((btn) => btn.textContent?.includes('Accept all cookies')),
      { timeout },
    );

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Accept all cookies'));
      if (btn) {
        btn.click();
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('✓ Cookies accepted');
  } catch (error) {
    console.log('No cookie dialog found or already accepted');
  }
}

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 50,
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating to SJ.se results page...');
await page.goto(
  'https://www.sj.se/en/search-journey/choose-journey/Stockholm%20Central/Malmö%20Central/2025-12-05',
  { waitUntil: 'networkidle0', timeout: 60000 },
);
console.log('✓ Page loaded\n');

// Accept cookies
await acceptCookies(page);

// Wait for initial cards to load
console.log('Waiting for departure cards to load...');
await page.waitForSelector('[data-testid]', { timeout: 10000 });
await new Promise((resolve) => setTimeout(resolve, 2000));

// Count initial cards
const initialCount = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  return Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  }).length;
});
console.log(`Initial departure cards: ${initialCount}\n`);

// Test scroll utility
console.log('Testing scroll utility...');
await scrollToBottom(page, { scrollDelay: 500 });

// Count final cards
const finalCount = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  return Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  }).length;
});
console.log(`Final departure cards: ${finalCount}\n`);

// Results
if (finalCount > initialCount) {
  console.log(`✅ SUCCESS: Loaded ${finalCount - initialCount} additional cards via lazy loading`);
} else if (finalCount === initialCount) {
  console.log('⚠️  No additional cards loaded (might be all loaded initially, or scroll didn\'t trigger)');
} else {
  console.log('❌ ERROR: Card count decreased (unexpected)');
}

console.log('\nKeeping browser open for 5 seconds...');
await new Promise((resolve) => setTimeout(resolve, 5000));

await browser.close();
console.log('✓ Test complete');
