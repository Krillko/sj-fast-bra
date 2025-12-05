import type { Page } from 'puppeteer';

/**
 * Scrolls to the bottom of a page incrementally to trigger lazy loading.
 * Waits for new content to load between scrolls.
 *
 * @param page - Puppeteer page instance
 * @param options - Scroll configuration options
 * @returns Promise that resolves when scrolling is complete
 */
export async function scrollToBottom(
  page: Page,
  options: {
    /** Delay between scroll actions in milliseconds (default: 1500) */
    scrollDelay?: number;
    /** Maximum time to spend scrolling in milliseconds (default: 30000) */
    maxScrollTime?: number;
    /** Maximum number of scroll attempts (default: 20) */
    maxScrollAttempts?: number;
  } = {}
): Promise<void> {
  const {
    scrollDelay = 1500,
    maxScrollTime = 30000,
    maxScrollAttempts = 20,
  } = options;

  const startTime = Date.now();

  await page.evaluate(async(scrollDelayMs: number, maxTime: number, maxAttempts: number) => {
    await new Promise<void>((resolve) => {
      let lastHeight = document.body.scrollHeight;
      let stableCount = 0; // Count how many times height stayed the same
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

        // Wait a moment for content to load, then check height
        setTimeout(() => {
          const newHeight = document.body.scrollHeight;

          if (newHeight === lastHeight) {
            stableCount++;
            // Height stable for 3 checks in a row = we're done
            if (stableCount >= 3) {
              clearInterval(scrollInterval);
              resolve();
            }
          } else {
            // Height changed, reset stable count and update
            stableCount = 0;
            lastHeight = newHeight;
          }
        }, scrollDelayMs / 2); // Check halfway through the delay
      }, scrollDelayMs);
    });
  }, scrollDelay, maxScrollTime, maxScrollAttempts);

  const elapsedTime = Date.now() - startTime;
  console.log(`✓ Scrolling complete. Took ${elapsedTime}ms`);
}

/**
 * Accepts cookie consent dialog on SJ.se if present.
 *
 * @param page - Puppeteer page instance
 * @param timeout - Maximum time to wait for cookie dialog (default: 5000ms)
 */
export async function acceptCookies(page: Page, timeout = 5000): Promise<void> {
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button'))
        .find((btn) => btn.textContent?.includes('Accept all cookies')),
      { timeout }
    );

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Accept all cookies'));
      if (btn) {
        (btn as HTMLButtonElement).click();
      }
    });

    // Wait for dialog to close
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('✓ Cookies accepted');
  } catch {
    console.log('No cookie dialog found or already accepted');
  }
}

/**
 * Adds random human-like delay between actions.
 *
 * @param minMs - Minimum delay in milliseconds
 * @param maxMs - Maximum delay in milliseconds
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Waits for navigation to complete and page to be stable.
 *
 * @param page - Puppeteer page instance
 * @param options - Wait options
 */
export async function waitForPageStable(
  page: Page,
  options: {
    /** Wait until network is idle (default: 'networkidle0') */
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    /** Additional wait time after navigation in milliseconds (default: 1000) */
    additionalWait?: number;
  } = {}
): Promise<void> {
  const { waitUntil = 'networkidle0', additionalWait = 1000 } = options;

  try {
    await page.waitForNavigation({ waitUntil, timeout: 30000 });
  } catch {
    // Navigation might have already happened, ignore
  }

  if (additionalWait > 0) {
    await new Promise((resolve) => setTimeout(resolve, additionalWait));
  }
}
