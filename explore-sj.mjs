import puppeteer from 'puppeteer';
import fs from 'fs/promises';

console.log('🚂 Starting SJ.se exploration...\n');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();

// Set viewport for desktop
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating to SJ.se homepage...');
try {
  await page.goto('https://www.sj.se/en', { waitUntil: 'networkidle0', timeout: 30000 });
  console.log('✓ Homepage loaded\n');
} catch (error) {
  console.error('✗ Failed to load page:', error.message);
  await browser.close();
  process.exit(1);
}

// Get the current URL to see the actual structure
const currentURL = page.url();
console.log('Current URL:', currentURL, '\n');

// Take initial screenshot
await page.screenshot({ path: 'screenshots/01-initial-load.png', fullPage: true });
console.log('✓ Screenshot saved: 01-initial-load.png\n');

// Wait a bit for any dynamic content
await new Promise((resolve) => setTimeout(resolve, 2000));

// Get page title
const title = await page.title();
console.log('Page title:', title);

// Check if there are departures
const html = await page.content();
await fs.writeFile('screenshots/page-source.html', html);
console.log('✓ HTML saved: page-source.html\n');

// Look for common selectors
console.log('Analyzing page structure...\n');

// Search for departure-related elements
const selectors = [
  'div[class*="departure"]',
  'div[class*="journey"]',
  'div[class*="trip"]',
  'button[class*="departure"]',
  'li[class*="departure"]',
  '[data-testid*="departure"]',
  '[data-testid*="journey"]',
];

for (const selector of selectors) {
  try {
    const elements = await page.$$(selector);
    if (elements.length > 0) {
      console.log(`✓ Found ${elements.length} elements for: ${selector}`);

      // Get the first element's HTML
      const firstEl = elements[0];
      const outerHTML = await page.evaluate((el) => el.outerHTML.substring(0, 200), firstEl);
      console.log(`  Preview: ${outerHTML}...\n`);
    }
  } catch (error) {
    // Selector not found, skip
  }
}

// Get all visible text to understand structure
const bodyText = await page.evaluate(() => document.body.innerText);
console.log('\n--- Page Text Preview (first 500 chars) ---');
console.log(bodyText.substring(0, 500));
console.log('...\n');

await browser.close();
console.log('✓ Exploration complete! Check the screenshots/ directory for outputs.');
