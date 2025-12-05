import puppeteer from 'puppeteer';
import fs from 'fs/promises';

console.log('🔍 Testing SJ.se results page interaction...\n');

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 100,
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating directly to results page...');
await page.goto('https://www.sj.se/en/search-journey/choose-journey/Stockholm%20Central/Malmö%20Central/2025-12-05', {
  waitUntil: 'networkidle0',
  timeout: 60000,
});
console.log('✓ Results page loaded\n');

// Accept cookies
console.log('Checking for cookie dialog...');
try {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('button')).find((btn) => btn.textContent.includes('Accept all cookies')),
    { timeout: 3000 },
  );
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Accept all cookies'));
    if (btn) btn.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('✓ Cookies accepted\n');
} catch (error) {
  console.log('No cookie dialog found\n');
}

// Wait for departure cards to load
console.log('Waiting for departure cards to load...');
await page.waitForSelector('[data-testid]', { timeout: 10000 });
await new Promise((resolve) => setTimeout(resolve, 2000));
console.log('✓ Departure cards loaded\n');

// Test 1: Count initial departure cards
console.log('=== TEST 1: Counting departure cards ===');
const initialCount = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  return Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  }).length;
});
console.log(`Found ${initialCount} departure cards initially\n`);

// Test 2: Scroll to bottom and check if more cards load
console.log('=== TEST 2: Testing lazy loading (scroll behavior) ===');
await page.evaluate(async () => {
  await new Promise((resolve) => {
    let lastHeight = document.body.scrollHeight;
    const scrollInterval = setInterval(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) {
        clearInterval(scrollInterval);
        resolve();
      }
      lastHeight = newHeight;
    }, 500);
  });
});
await new Promise((resolve) => setTimeout(resolve, 3000));

const finalCount = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  return Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  }).length;
});
console.log(`After scrolling: ${finalCount} departure cards`);
console.log(`Lazy loading: ${finalCount > initialCount ? 'YES (loaded more cards)' : 'NO (same count)'}\n`);

// Test 3: Extract data from first 3 departure cards WITHOUT clicking
console.log('=== TEST 3: Extracting visible data (before click) ===');
const visibleData = await page.evaluate(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  const departureCards = Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  });

  return departureCards.slice(0, 3).map((card, index) => {
    const html = card.innerHTML;

    // Extract times (look for patterns like "06:00" or "10:30")
    const timeMatches = html.match(/\d{2}:\d{2}/g);

    // Extract duration (look for patterns like "4 h 30 min")
    const durationMatch = html.match(/(\d+\s*h\s*\d+\s*min|\d+\s*h|\d+\s*min)/i);

    // Extract changes (look for "Direct" or "1 change" etc)
    const changesMatch = html.match(/(Direct|\d+\s*change)/i);

    // Extract prices (look for "SEK" or number patterns near "From")
    const priceMatches = html.match(/(\d+)\s*SEK|From\s*(\d+)/gi);

    return {
      cardIndex: index + 1,
      testId: card.getAttribute('data-testid'),
      times: timeMatches || [],
      duration: durationMatch ? durationMatch[0] : null,
      changes: changesMatch ? changesMatch[0] : null,
      visiblePrices: priceMatches || [],
      hasClickableElement: !!card.querySelector('button, [role="button"]'),
    };
  });
});

visibleData.forEach((data) => {
  console.log(`\nCard ${data.cardIndex}:`);
  console.log(JSON.stringify(data, null, 2));
});

// Test 4: Click on first departure card and see what happens
console.log('\n\n=== TEST 4: Clicking on first departure card ===');
await page.screenshot({ path: 'screenshots/05-before-click.png', fullPage: true });
console.log('✓ Screenshot: 05-before-click.png');

const firstCard = await page.evaluateHandle(() => {
  const cards = document.querySelectorAll('[data-testid*="-"]');
  const departureCards = Array.from(cards).filter((card) => {
    const testId = card.getAttribute('data-testid');
    return testId && testId.match(/^[0-9a-f-]{36}$/);
  });
  return departureCards[0];
});

if (firstCard) {
  console.log('Clicking first departure card...');
  await firstCard.click();
  await new Promise((resolve) => setTimeout(resolve, 3000));

  await page.screenshot({ path: 'screenshots/06-after-click.png', fullPage: true });
  console.log('✓ Screenshot: 06-after-click.png');

  // Check what changed
  const afterClickData = await page.evaluate(() => {
    const body = document.body.innerHTML;

    // Look for expanded price information
    const priceElements = Array.from(document.querySelectorAll('[class*="price"], [class*="Price"]'));
    const prices = priceElements.map((el) => ({
      text: el.textContent?.trim().substring(0, 50),
      className: el.className,
    }));

    // Look for class type labels (2nd class, 1st class, etc)
    const classLabels = body.match(/(2nd class|First class|Economy|Standard)/gi) || [];

    // Check if URL changed
    const currentUrl = window.location.href;

    return {
      urlChanged: currentUrl,
      uniqueClassLabels: [...new Set(classLabels)],
      priceElementsCount: prices.length,
      samplePrices: prices.slice(0, 5),
    };
  });

  console.log('\nAfter clicking first card:');
  console.log(JSON.stringify(afterClickData, null, 2));

  // Save HTML after click
  const afterClickHTML = await page.content();
  await fs.writeFile('screenshots/after-click.html', afterClickHTML);
  console.log('✓ HTML saved: after-click.html');
}

console.log('\n\n=== TEST 5: Analyzing DOM structure for price selectors ===');
const priceStructure = await page.evaluate(() => {
  // Look for all elements that might contain price information
  const searchPatterns = [
    { selector: '[class*="price"]', description: 'Elements with "price" in class' },
    { selector: '[class*="Price"]', description: 'Elements with "Price" in class' },
    { selector: '[data-testid*="price"]', description: 'Elements with "price" in testid' },
    { selector: 'span:has-text("SEK")', description: 'Spans containing "SEK"' },
  ];

  const results = {};

  searchPatterns.forEach((pattern) => {
    try {
      const elements = document.querySelectorAll(pattern.selector);
      results[pattern.description] = {
        count: elements.length,
        samples: Array.from(elements).slice(0, 3).map((el) => ({
          text: el.textContent?.trim().substring(0, 100),
          className: el.className,
          testId: el.getAttribute('data-testid'),
        })),
      };
    } catch (e) {
      results[pattern.description] = { error: 'Selector not supported in querySelectorAll' };
    }
  });

  // Look for ticket class labels
  const allText = document.body.innerText;
  const classLabels = allText.match(/(2nd class[^,\n]*|First class[^,\n]*|Economy[^,\n]*|Standard[^,\n]*)/gi) || [];
  results.classLabels = {
    found: classLabels.length,
    unique: [...new Set(classLabels.map((l) => l.trim()))],
  };

  return results;
});

console.log('\nPrice structure analysis:');
console.log(JSON.stringify(priceStructure, null, 2));

console.log('\n\n✓ All tests complete! Keeping browser open for 10 seconds...');
await new Promise((resolve) => setTimeout(resolve, 10000));

await browser.close();
console.log('✓ Browser closed\n');
