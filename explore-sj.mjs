import puppeteer from 'puppeteer';
import fs from 'fs/promises';

console.log('🚂 Starting SJ.se search form exploration...\n');

const browser = await puppeteer.launch({
  headless: false, // Set to false to watch the browser
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  slowMo: 50, // Slow down by 50ms to see what's happening
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating to SJ.se homepage...');
await page.goto('https://www.sj.se/en', { waitUntil: 'networkidle0', timeout: 30000 });
console.log('✓ Homepage loaded\n');

// Accept cookies first
console.log('Accepting cookies...');
try {
  // Wait for any button containing "Accept all cookies" text
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('button')).find((btn) => btn.textContent.includes('Accept all cookies')),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Accept all cookies'));
    if (btn) btn.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('✓ Cookies accepted\n');
} catch (error) {
  console.log('No cookie dialog found or already accepted\n');
}

// Take screenshot of homepage
await page.screenshot({ path: 'screenshots/01-homepage.png', fullPage: true });
console.log('✓ Screenshot: 01-homepage.png\n');

// Click the search button
console.log('Clicking search button...');
await page.click('[data-testid="searchTripButton"]');
await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for modal to open

// Take screenshot of search modal
await page.screenshot({ path: 'screenshots/02-search-modal.png', fullPage: true });
console.log('✓ Screenshot: 02-search-modal.png\n');

// Save the HTML to analyze form structure
const modalHTML = await page.content();
await fs.writeFile('screenshots/search-modal.html', modalHTML);
console.log('✓ HTML saved: search-modal.html\n');

// Look for input fields
console.log('Analyzing search form...');
const inputs = await page.$$('input');
console.log(`Found ${inputs.length} input fields\n`);

// Try to find from/to/date fields by common patterns
const formElements = await page.evaluate(() => {
  const getElementInfo = (el) => ({
    tag: el.tagName,
    type: el.type || 'N/A',
    name: el.name || 'N/A',
    id: el.id || 'N/A',
    placeholder: el.placeholder || 'N/A',
    ariaLabel: el.getAttribute('aria-label') || 'N/A',
    dataTestId: el.getAttribute('data-testid') || 'N/A',
  });

  const inputs = Array.from(document.querySelectorAll('input')).map(getElementInfo);
  const buttons = Array.from(document.querySelectorAll('button')).map((btn) => ({
    text: btn.textContent?.trim().substring(0, 50) || 'N/A',
    dataTestId: btn.getAttribute('data-testid') || 'N/A',
    ariaLabel: btn.getAttribute('aria-label') || 'N/A',
  }));

  return { inputs, buttons };
});

console.log('=== INPUT FIELDS ===');
formElements.inputs.forEach((input, i) => {
  console.log(`Input ${i + 1}:`, JSON.stringify(input, null, 2));
});

console.log('\n=== BUTTONS ===');
formElements.buttons.slice(0, 10).forEach((btn, i) => {
  console.log(`Button ${i + 1}:`, JSON.stringify(btn, null, 2));
});

// Now fill in the form
console.log('\n\nFilling in search form...');
await page.type('#fromLocation', 'Stockholm Central');
await new Promise((resolve) => setTimeout(resolve, 1000));

// Click first autocomplete suggestion for from
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await new Promise((resolve) => setTimeout(resolve, 1000));

await page.type('#toLocation', 'Malmö Central');
await new Promise((resolve) => setTimeout(resolve, 1000));

// Click first autocomplete suggestion for to
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await new Promise((resolve) => setTimeout(resolve, 1000));

console.log('✓ Stations filled\n');

// Date should already be today by default
console.log('Using default date (today)\n');

// Take screenshot before submitting
await page.screenshot({ path: 'screenshots/03-form-filled.png', fullPage: true });
console.log('✓ Screenshot: 03-form-filled.png\n');

// Click search button
console.log('Submitting search...');
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Search journey' && !b.getAttribute('data-testid'));
  if (btn) btn.click();
});
await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for results to load

// Take screenshot of results page
await page.screenshot({ path: 'screenshots/04-results-page.png', fullPage: true });
console.log('✓ Screenshot: 04-results-page.png\n');

// Get current URL
const resultsURL = page.url();
console.log('Results URL:', resultsURL, '\n');

// Save results page HTML
const resultsHTML = await page.content();
await fs.writeFile('screenshots/results-page.html', resultsHTML);
console.log('✓ HTML saved: results-page.html\n');

console.log('\n\nPausing for 5 seconds before closing...');
await new Promise((resolve) => setTimeout(resolve, 5000));

await browser.close();
console.log('\n✓ Exploration complete! Check screenshots/ for outputs.');
