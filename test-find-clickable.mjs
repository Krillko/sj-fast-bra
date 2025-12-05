import puppeteer from 'puppeteer';

console.log('🔍 Finding clickable element in card...\n');

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 200,
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

console.log('Analyzing first card structure...');
const cardInfo = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  const departureCards = Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  });

  const firstCard = departureCards[0];
  if (!firstCard) return null;

  // Find all clickable elements inside
  const buttons = firstCard.querySelectorAll('button');
  const links = firstCard.querySelectorAll('a');
  const clickables = firstCard.querySelectorAll('[role="button"]');

  return {
    cardTag: firstCard.tagName,
    cardRole: firstCard.getAttribute('role'),
    cardOnClick: !!firstCard.getAttribute('onclick'),
    cardCursor: window.getComputedStyle(firstCard).cursor,
    buttonsCount: buttons.length,
    linksCount: links.length,
    clickablesCount: clickables.length,
    buttonInfo: Array.from(buttons).map((b) => ({
      text: b.textContent?.trim().substring(0, 50),
      type: b.type,
      disabled: b.disabled,
    })),
    linkInfo: Array.from(links).map((a) => ({
      text: a.textContent?.trim().substring(0, 50),
      href: a.getAttribute('href'),
    })),
  };
});

console.log('\nCard structure:');
console.log(JSON.stringify(cardInfo, null, 2));

console.log('\n\nNow trying to click the card itself...');
const currentUrl1 = page.url();
console.log('Before click:', currentUrl1);

// Try clicking the card div
await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  const departureCards = Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  });
  departureCards[0].click();
});

await new Promise((resolve) => setTimeout(resolve, 3000));
const currentUrl2 = page.url();
console.log('After click:', currentUrl2);
console.log('Did it navigate?', currentUrl1 !== currentUrl2 ? 'YES' : 'NO');

console.log('\nKeeping browser open for inspection...');
await new Promise((resolve) => setTimeout(resolve, 20000));

await browser.close();
