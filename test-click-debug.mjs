import puppeteer from 'puppeteer';

console.log('🐛 Debugging card click...\n');

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 100,
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating to results page...');
await page.goto(
  'https://www.sj.se/en/search-journey/choose-journey/Stockholm%20Central/Malmö%20Central/2025-12-06',
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

// Wait for cards
await page.waitForSelector('[data-testid]', { timeout: 10000 });
await new Promise((resolve) => setTimeout(resolve, 2000));

console.log('Getting first card...');
const cardHandle = await page.evaluateHandle(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  const departureCards = Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  });
  console.log('Found', departureCards.length, 'cards');
  return departureCards[0];
});

console.log('Card handle:', cardHandle ? 'FOUND' : 'NOT FOUND');

if (cardHandle) {
  console.log('Clicking card and waiting for navigation...');

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      cardHandle.click(),
    ]);

    console.log('✅ Navigation successful!');
    console.log('Current URL:', page.url());
  } catch (error) {
    console.log('❌ Navigation failed:', error.message);
  }
}

console.log('\nKeeping browser open for 10 seconds...');
await new Promise((resolve) => setTimeout(resolve, 10000));

await browser.close();
