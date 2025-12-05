import puppeteer from 'puppeteer';

console.log('✅ Testing button click...\n');

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 100,
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

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
  console.log('✓ Cookies accepted');
} catch {
  console.log('No cookie dialog');
}

await page.waitForSelector('[data-testid]', { timeout: 10000 });
await new Promise((resolve) => setTimeout(resolve, 2000));

console.log('\nClicking button in first card...');
const buttonHandle = await page.evaluateHandle(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  const departureCards = Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  });

  const card = departureCards[0];
  if (!card) return null;

  const button = card.querySelector('button');
  return button;
});

const urlBefore = page.url();
console.log('URL before:', urlBefore);

// Click and wait for navigation (not in Promise.all)
await buttonHandle.click();
console.log('Button clicked, waiting for navigation...');
await new Promise((resolve) => setTimeout(resolve, 3000));

const urlAfter = page.url();
console.log('URL after:', urlAfter);

if (urlAfter.includes('choose-ticket-type')) {
  console.log('\n✅ SUCCESS: Navigated to ticket selection page!');
} else {
  console.log('\n❌ FAILED: Did not navigate to ticket selection page');
}

console.log('\nKeeping browser open for 5 seconds...');
await new Promise((resolve) => setTimeout(resolve, 5000));

await browser.close();
