import puppeteer from 'puppeteer';

console.log('🧪 Testing improved scroll logic...\n');

async function scrollToBottom(page, options = {}) {
  const {
    scrollDelay = 1500,
    maxScrollTime = 30000,
    maxScrollAttempts = 20,
  } = options;

  const startTime = Date.now();

  await page.evaluate(async(scrollDelayMs, maxTime, maxAttempts) => {
    await new Promise((resolve) => {
      let lastHeight = document.body.scrollHeight;
      let stableCount = 0;
      let attemptCount = 0;
      const startMs = Date.now();

      const scrollInterval = setInterval(() => {
        if (Date.now() - startMs > maxTime || attemptCount >= maxAttempts) {
          clearInterval(scrollInterval);
          resolve();
          return;
        }

        window.scrollTo(0, document.body.scrollHeight);
        attemptCount++;

        setTimeout(() => {
          const newHeight = document.body.scrollHeight;

          if (newHeight === lastHeight) {
            stableCount++;
            if (stableCount >= 3) {
              clearInterval(scrollInterval);
              resolve();
            }
          } else {
            stableCount = 0;
            lastHeight = newHeight;
          }
        }, scrollDelayMs / 2);
      }, scrollDelayMs);
    });
  }, scrollDelay, maxScrollTime, maxScrollAttempts);

  const elapsedTime = Date.now() - startTime;
  console.log(`✓ Scrolling complete. Took ${elapsedTime}ms`);
}

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 50,
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating to Stockholm → Malmö (2025-12-17)...');
await page.goto(
  'https://www.sj.se/en/search-journey/choose-journey/Stockholm%20Central/Malmö%20Central/2025-12-17',
  { waitUntil: 'networkidle0', timeout: 60000 },
);

// Accept cookies
try {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('button'))
      .find((btn) => btn.textContent?.includes('Accept all cookies')),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Accept all cookies'));
    if (btn) btn.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('✓ Cookies accepted\n');
} catch {
  console.log('No cookie dialog\n');
}

await page.waitForSelector('[data-testid]', { timeout: 10000 });
await new Promise((resolve) => setTimeout(resolve, 2000));

// Count before scroll
const beforeCount = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  return Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  }).length;
});
console.log(`Before scroll: ${beforeCount} departure cards\n`);

// Scroll with improved logic
console.log('Scrolling with improved logic...');
await scrollToBottom(page);

// Count after scroll
const afterCount = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  return Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  }).length;
});
console.log(`After scroll: ${afterCount} departure cards\n`);

// Get all departure times
const departureTimes = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  const departureCards = Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  });

  return departureCards.map((card) => {
    const html = card.innerHTML;
    const timeMatches = html.match(/\d{2}:\d{2}/g);
    return timeMatches?.[0] || '';
  });
});

console.log('All departure times found:');
departureTimes.forEach((time, i) => {
  console.log(`  ${i + 1}. ${time}`);
});

console.log(`\n${beforeCount} → ${afterCount} cards (loaded ${afterCount - beforeCount} more)`);

if (afterCount > beforeCount) {
  console.log('✅ Scroll successfully loaded more trains!');
} else {
  console.log('⚠️  No additional trains loaded');
}

console.log('\nKeeping browser open for 5 seconds...');
await new Promise((resolve) => setTimeout(resolve, 5000));

await browser.close();
