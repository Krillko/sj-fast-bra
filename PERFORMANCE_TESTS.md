# Performance Tests & Experiments

This document tracks all performance optimization attempts, including those that were reverted. This prevents wasting time re-testing the same approaches.

## Test Log Format

Each test should include:
- **Date**: When the test was conducted
- **Hypothesis**: What we expected to improve and why
- **Implementation**: Brief description of what was changed
- **Measurements**: Actual timing data (before/after)
- **Result**: Keep or revert, and why
- **Commit**: Hash of the commit (even if later reverted)

---

## 2026-01-12: Timing Infrastructure & Stop Button

**Hypothesis**: Need baseline timing infrastructure before testing optimizations.

**Implementation**:
- Added comprehensive timing collection to scraper
  - Per-departure timings (cache check, navigate, extract, cache write, navigate back)
  - Overall statistics (total time, scroll time, average per departure)
  - Timing data saved to cache with 24h TTL
- Created abort mechanism for local development
  - `/api/abort-scrape` endpoint (local only)
  - Scraper checks abort signal before each departure
  - UI stop button in loading banner
- Updated result interface to include timing data

**Files Modified**:
- `server/api/scrape.ts` - Added timing collection and abort support
- `server/api/abort-scrape.ts` - New endpoint for aborting scrapes
- `app/pages/[date]/[from]/[to].vue` - Added stop button UI
- `CLAUDE.md` - Added performance testing documentation requirements
- `PERFORMANCE_TESTS.md` - Created this file

**Measurements**:
- Infrastructure only, no performance changes yet
- Timing data now available for future comparisons

**Result**: ✅ **KEEP** - Essential infrastructure for all future performance work

**Commit**: `561885e`

---

## 2026-01-12: Browser Back vs Page Reload

**Issue**: 27/27 departures failing on Malmö→Stockholm route with "Card not found" error. The SJ.se website works fine.

**Hypothesis**:
1. Using `page.goBack()` instead of `page.goto(url)` should be much faster due to browser caching
2. The "Card not found" error is because we reload the page but don't scroll again to load lazy-loaded cards
3. Browser back should preserve scroll position and loaded cards

**Implementation**:
- Changed from `page.goto(url)` to `page.goBack()` after extracting prices
- Added `scrollToBottom()` after going back to ensure all cards are loaded
- Increased timeouts from 5s to 20-30s to fix immediate failures
- Added `stopOnFirstError` flag to catch issues faster during development

**Files Modified**:
- `nuxt.config.ts` - Increased timeouts, added stopOnFirstError flag
- `server/api/scrape.ts` - Use browser back + scroll instead of page reload

**Previous Behavior**:
- Using `page.goto(url)` with `waitUntil: 'networkidle0'`
- No scrolling after reload
- Comment in code: "reload for fresh DOM instead of browser back"
- CLAUDE.md says "Never use browser back navigation" due to stale DOM concerns

**Expected Improvement**:
- Browser back should be near-instant with caching (vs 5-30s for full page reload)
- Scrolling after back ensures all cards are loaded
- Should fix "Card not found" errors

**Measurements**:
- **Previous**: Navigate back ~3.3-3.5s (page reload, no scroll) → Card not found errors
- **Browser back + scroll**: Navigate back ~5.6-5.7s total
  - Scroll alone: ~5.2-5.3s (using 1.5s delay between attempts)
  - Browser back: ~0.3-0.4s
  - **Result**: SLOWER than page reload!
  - **Failed** after 13/27 departures: "Waiting for selector failed" (DOM stale issues)
- Average per departure: 6077ms (much worse than expected)

**Result**: ❌ **REVERT** - Browser back is slower due to mandatory scroll, plus DOM stability issues

**Why it failed**:
1. Scrolling takes 5.2s every time (with 1.5s delays)
2. Page reload was only 3.3-3.5s, so reload + fast scroll should be better
3. Browser back has DOM stability issues after multiple navigations (confirming CLAUDE.md warning)

**Next approach**: Try page.goto (reload) + optimized scroll (faster delay)

**Commit**: `8f60249` (will be reverted)

---

## 2026-01-12: Page Reload + Fast Scroll

**Hypothesis**: Page reload is more stable than browser back. Use page.goto but optimize scroll speed (300ms vs 1500ms delays).

**Implementation**:
- Reverted back to `page.goto(url)` for DOM stability
- Added `scrollToBottom()` after reload with optimized parameters:
  - `scrollDelay: 300` (was 1500ms default - 5x faster)
  - `maxScrollTime: 10000` (10s limit)
- Applied fast scroll to both initial load and after each back navigation

**Files Modified**:
- `server/api/scrape.ts` - page.goto with fast scroll parameters

**Expected Improvement**:
- Page reload: ~3.3-3.5s (known from previous data)
- Fast scroll: ~1-1.5s (vs 5.2s with slow scroll)
- Total: ~4.5-5s per departure
- Should fix "Card not found" errors AND be faster than browser back
- DOM stability (no stale element issues)

**Measurements**: [Waiting for test results...]

**Result**: [To be determined - TESTING IN PROGRESS]

**Commit**: `60b2057`

---

## 2026-01-12: Consistent Failure at Departure #9 (10:07)

**Issue**: Scraper ALWAYS fails at departure #9 (10:07 → 14:36) with "Navigation timeout of 30000 ms exceeded"
- Happens consistently on multiple dates (2026-01-15, 2026-01-16)
- First 8 departures succeed (~80-85 seconds total)
- 9th departure times out waiting for navigation after clicking card
- This route used to work previously

**Hypothesis**:
1. **Anti-scraping detection** (most likely): SJ.se detects pattern after 8 requests and rate limits/blocks
2. **That specific departure**: 10:07 train has different structure/requirements
3. **Browser exhaustion**: Memory/connection issues after 8 page reloads
4. **Session expiration**: Something expires after ~80 seconds

**Pattern Analysis**:
- Succeeds: Departures 1-8 (06:01, 06:07, 07:01, 07:07, 08:07, 09:07, 09:18, 10:01)
- Fails: Departure 9 (10:07) - ALWAYS this specific time
- Error: Navigation timeout after 30s
- No pattern change in network timing before failure

**Implementation (Testing Anti-Scraping Theory)**:
- Increased `navigationClick` timeout: 30s → 90s (to see if it eventually loads)
- Increased `navigateBack` timeout: 30s → 60s
- Increased `selectorAfterBack`: 10s → 20s
- **Added 2s delay between departures** to slow down and appear more human-like

**Files Modified**:
- `nuxt.config.ts` - Increased timeouts, added delayBetweenDepartures
- `server/api/scrape.ts` - Implement delay between departures

**Expected Results**:
- If it's rate limiting: 2s delays might help get past 9 departures
- If 90s timeout helps: It's slow response, not blocking
- If still fails at #9: Likely hard block or specific departure issue

**Measurements**:
- Total time: 156.6s (vs 80s without delays)
- Average per departure: 16.3s (vs 8-10s)
- 2s delays ARE working (visible in logs)
- Still failed at departure #9 (10:07) after waiting FULL 92 seconds (90s timeout + 2s delay)

**Result**: ❌ **FAILED** - Delays and higher timeout didn't help

**Conclusion**:
- NOT rate limiting (delays didn't help)
- NOT slow response (90s is plenty)
- Either:
  1. Hard block after 8 requests (counter-based)
  2. OR that specific 10:07 departure is broken

**Commit**: `8c3db47`

---

## 2026-01-12: Skip Test - Is it Counter #9 or Departure 10:07?

**Hypothesis**: Need to determine if the issue is:
- Position #9 in sequence (counter-based blocking)
- OR specifically the 10:07 departure (broken/different structure)

**Implementation**:
- Skip 10:07 departure entirely (local only)
- Process departures 1-8, then skip to #10 (10:01 → next departure)
- If it fails at new position #9: It's counter-based
- If it succeeds past 8 departures: It's specifically 10:07 that's broken

**Files Modified**:
- `server/api/scrape.ts` - Add skip logic for 10:07 departure

**Expected Results**:
- **Scenario A**: Fails at new position #9 → Counter-based blocking (need to restart browser or use different approach)
- **Scenario B**: Succeeds past 8 departures → 10:07 departure is broken (can skip it or investigate why)

**Measurements**:
- Successfully skipped 10:07 departure (total: 26 instead of 27)
- Processed departures 1-8 successfully
- Position #9 is now 11:07 (instead of 10:07)
- **FAILED at position #9 (11:07)** with navigation timeout after 90s
- Same error, different departure

**Result**: ✅ **CONFIRMED - Scenario A: Counter-Based Blocking**

**Conclusion**:
- NOT the 10:07 departure specifically
- It's the **9th REQUEST** that gets blocked
- SJ.se has anti-scraping detection that blocks after 8 successful clicks
- The blocking is position-based, not time-based or departure-specific

**Root Cause**: After 8 successful departure detail page navigations, SJ.se stops responding to the 9th navigation request. This is a hard block, not rate limiting (delays don't help, timeout doesn't help).

**Commit**: `2dff5d8`

---

## Solutions for Counter-Based Blocking

### Option 1: Browser Restart Every 8 Departures (Recommended)
- Close and reopen Puppeteer browser after every 8 departures
- Reset the counter from SJ.se's perspective
- Pros: Should work reliably
- Cons: Slower (browser restart overhead), more complex code

### Option 2: Request Official API Access
- Contact SJ.se and explain the use case
- Request API access or higher rate limits
- Pros: Proper solution, more reliable
- Cons: May not be granted, takes time

### Option 3: Accept the Limitation
- Only scrape first 8 departures per route
- For routes with >8 departures, show "View more on SJ.se" link
- Pros: Simple, no workarounds
- Cons: Incomplete data for popular routes

### Option 4: Session Refresh Strategy
- Try refreshing cookies/session between batches
- May or may not work (needs testing)
- Pros: Lighter than full browser restart
- Cons: May not reset the counter

### Next Steps
1. ✅ Implement Option 1 (browser restart) - DONE
2. Test if browser restart resets the counter
3. If successful, optimize restart timing and caching strategy

---

## 2026-01-12: Browser Restart Solution (Option 1)

**Implementation**: Restart Puppeteer browser every 8 scraped departures to reset SJ.se's counter.

**How it works**:
- Track `scrapedInCurrentSession` counter (only counts successful scrapes, not cache hits)
- After 8 successful scrapes, before attempting #9:
  1. Close current browser instance
  2. Launch new browser with same configuration
  3. Navigate to results page
  4. Accept cookies
  5. Scroll to load all cards
  6. Reset counter to 0
  7. Continue with departure #9

**Implementation details**:
- Only restarts if there are more departures to process
- Failed departures don't increment counter
- Cached departures don't increment counter (no scraping = no counter)
- Browser restart timing tracked separately

**Files Modified**:
- `server/api/scrape.ts` - Added browser restart logic after 8 departures

**Expected Results**:
- Should bypass counter-based blocking
- Restart overhead: ~10-15s (browser launch + navigate + scroll)
- Trade-off: Slower but complete data
- For 27 departures: 3 restarts (after #8, #16, #24)

**Measurements**: [Waiting for test results...]

**Result**: [To be determined - TESTING IN PROGRESS]

**Commit**: `450cfc1`

---

## 2026-01-28: Remove Scrolling - Cards Already in DOM (FAILED - Anti-Scraping)

**Discovery**: User tested SJ.se in Chrome offline mode and found ALL departure cards are already in the DOM before scrolling. Scrolling is completely unnecessary!

**Hypothesis**:
- Cards exist in DOM immediately when page loads
- Incremental scrolling (with 300ms delays) wastes 5+ seconds per departure
- Should be able to skip scrolling entirely or use single fast scroll

**Testing Results**:

1. **Cards already present confirmation**:
   ```
   ⚠️  TEST: 72 cards exist BEFORE scrolling
   ⚠️  TEST: 72 cards exist AFTER scrolling (difference: 0)
   ```
   - Initial load: 72 cards, scrolling adds 0
   - After navigate back: 72 cards, scrolling adds 0
   - Incremental scrolling wasted 1.3s initially, 5+ seconds on navigate back

2. **Performance improvement with single scroll**:
   - OLD (incremental scroll): Navigate back ~5-6s, Total per departure ~7-8s
   - NEW (single scroll): Navigate back ~2s, Total per departure **2.2s** ✨
   - **73% faster!** (7-8s → 2.2s per departure)

**Critical Blocker - Consistent Failure Pattern**:
- Departure #1: ✅ Works perfectly every time (2.2s)
- Departure #2: ❌ ALWAYS fails with 90s navigation timeout
- Error: Clicks wrong element (Storyblok `/components/content-and-register-interest` banner instead of departure card)
- Vue Router warnings indicate navigation to promotional component, not departure details

**What was tried**:
1. No scrolling, just hydration wait → Fails on #2
2. Single fast scroll to bottom → Fails on #2
3. scrollIntoView before clicking → Fails on #2
4. Increased hydration waits (500ms → 1.5s → 2s) → Fails on #2
5. Removed scrollIntoView to avoid conflicts → Fails on #2

**Pattern Analysis**:
- Something about page state AFTER first departure makes clicks target wrong element
- User tested in normal Chrome without ad blockers - no promotion banner visible
- Likely anti-scraping: Page intentionally breaks after first successful navigation
- Similar to previous counter-based blocking (fails at #9), but now fails at #2

**Files Modified**:
- `server/api/scrape.ts` - Removed incremental scrolling, added single fast scroll

**Result**: ❌ **BLOCKED BY ANTI-SCRAPING** - Cannot proceed past departure #2

**Conclusion**:
- Performance improvement is real (73% faster when it works)
- Anti-scraping detection is more aggressive than previously thought
- Not just counter-based blocking at #9, also element targeting manipulation at #2
- Need fundamentally different approach (see next test)

**Commit**: `c6f43fd`

---

## 2026-01-28: Proposed Solution - Parallel Single-Departure Scrapers

**User's Insight**: "Perhaps test to just get the list, then have parsers going to the list clicking one departure each, not using scroll or back"

**Proposed Architecture**:
1. Single "list scraper" - Gets the departure list once (just the times/route info visible in list)
2. Multiple "detail scrapers" - Each one:
   - Launches fresh browser instance
   - Navigates directly to results page
   - Clicks ONE specific departure
   - Extracts prices
   - Closes browser
   - No navigation back needed!

**Advantages**:
- Each scraper only makes 1 request to departure details (resets anti-scraping counter)
- No navigate back complexity (fresh page state every time)
- Can run in parallel for even faster scraping
- Mimics real user behavior (open new tab for each departure)

**Implementation Strategy**:
- Extract departure list info (times, duration, changes) from search results
- For each departure, spawn isolated scraper that only clicks that one card
- No state persists between departures (clean slate)

**Implementation**: ✅ **COMPLETED** - Parallel single-departure scrapers implemented

**How it works:**
1. Single "list scraper" extracts departure list (times, duration, changes, operator)
2. Close initial browser
3. For each departure:
   - Launch completely fresh independent browser instance
   - Navigate to results page
   - Click ONE specific departure
   - Extract prices
   - Close browser immediately
   - No back navigation needed!
4. 1-second delay between spawning scrapers

**Test Results (Stockholm → Malmö, 26 departures):**
- Departures 1-8: ✅ All successful
- Departure 9: ❌ Failed - Navigation timeout (90s)
- Departures 10-26: ❌ All failed with same timeout

**Key Finding - IP-Based Rate Limiting:**
- Even with completely independent browsers (no shared state/cookies/sessions)
- SJ.se tracks requests by IP address
- Blocks after 8 successful departure detail page navigations
- Block persists across all new browsers from same IP
- Confirms this is NOT session-based or cookie-based

**Advantages of parallel approach:**
- Architecturally sound ✅
- Mimics real user behavior (opening new tabs) ✅
- No complex back navigation logic ✅
- No DOM stability issues ✅
- Each scraper is completely isolated ✅

**Limitation:**
- Cannot bypass IP-based rate limiting without:
  - Proxy rotation infrastructure
  - Much longer delays (10-30s between requests)
  - Or accepting 8-departure limit

**Files Modified:**
- `server/api/scrape.ts` - Added `scrapeSingleDeparture()` function and parallel mode
- `server/api/scrape-stream.ts` - Added `useParallelScrapers` query parameter

**Status**: ✅ **WORKING** but limited to 8 departures per IP per session

**Commit**: `3d1b385`

---

## 2026-01-23: Navigate Back Timeout Fix + DOM Stability Improvements (REVERTED)

**Issue**: After implementing browser restart solution, scraper started failing on FIRST departure with "Navigation timeout" on the navigate BACK step (not the #9 blocking).

**Root Cause Analysis**:
- Changed from `page.goto(url)` to `domcontentloaded` fixed initial timeout
- But then got "Card not found" errors on departure #2
- Issue: DOM loaded but React/Vue components not yet hydrated (click handlers not attached)

**Implementation - Phase 1: Navigate Back Fix**:
- Changed `waitUntil: 'networkidle0'` to `waitUntil: 'domcontentloaded'`
  - `networkidle0` waits for no network activity for 500ms, which might never happen with SJ.se's background requests
  - `domcontentloaded` only waits for DOM to load, much more reliable
- Added 500ms hydration wait after DOM load → Still failed

**Implementation - Phase 2: DOM Stability Improvements**:
- Increased hydration wait: 500ms → 2000ms (allow full React/Vue initialization)
- Added 1000ms stabilization wait after scrolling (ensure cards fully rendered)
- Added 60s wait after browser restart (give fresh browser time to stabilize)
- Added explicit `waitForFunction` to verify departure cards are present before clicking:
  ```typescript
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll('[data-testid*="-"]');
    const departureCards = Array.from(cards).filter((card) => {
      const testId = card.getAttribute('data-testid');
      return testId && testId.match(/^[0-9a-f-]{36}$/);
    });
    return departureCards.length > 0;
  }, { timeout: 10000 });
  ```

**Implementation - Phase 3: Anti-Bot Measures**:
- Added `--incognito` flag to browser launch
- Added `--disable-blink-features=AutomationControlled` to hide automation
- Changed resource blocking: Keep stylesheets (only block images, fonts, media)
  - Stylesheets needed for proper rendering timing

**Implementation - Phase 4: Enhanced Debugging**:
- Added logging of available departure times when card not found:
  ```typescript
  const availableTimes = departureCards.map((card) => {
    const html = card.innerHTML;
    const timeMatches = html.match(/\d{2}:\d{2}/g);
    return timeMatches ? timeMatches[0] : 'no-time';
  });
  console.log(`DEBUG: Looking for ${departureTime}, available cards:`, availableTimes);
  ```

**Files Modified**:
- `server/api/scrape.ts` - Navigate back fix, DOM stability improvements, anti-bot measures, debugging

**Expected Results**:
- Navigate back should complete successfully (domcontentloaded more reliable)
- 2s hydration wait ensures React/Vue components fully initialized
- 1s stabilization after scroll ensures cards ready for interaction
- 60s post-restart wait gives fresh browser time to settle
- waitForFunction explicitly verifies cards are present before proceeding
- Anti-bot measures reduce detection risk

**Measurements**: [Test needed to verify full route completion]

**Result**: [To be determined - TESTING NEEDED]

**Notes**:
- Multiple timing adjustments made to ensure DOM stability
- Trade-off: Slower but more reliable
- Browser restart solution still in place (every 8 departures)
- Changes focused on reliability over speed

**Commit**: `fe6400e`

---

## Future Tests

Document all future performance experiments below, even if they fail.

### Ideas to Test
- Validate if 2s hydration + 1s stabilization can be reduced once stability confirmed
- Test if 60s post-restart wait can be reduced (may be overly conservative)
- Reduce timeout values after fixing main issues
- Parallel departure processing (risky - may trigger anti-scraping)
- Optimize cache read/write operations
- Skip scrolling if we know card is near the top
