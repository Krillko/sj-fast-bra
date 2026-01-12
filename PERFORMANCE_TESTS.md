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

**Measurements**: [Waiting for test results...]

**Result**: [To be determined - TESTING IN PROGRESS]

**Commit**: [To be added]

---

## Future Tests

Document all future performance experiments below, even if they fail.

### Ideas to Test
- Reduce timeout values after fixing main issues
- Parallel departure processing (risky - may trigger anti-scraping)
- Different `waitUntil` strategies (`domcontentloaded` vs `networkidle0`)
- Remove the 500ms hydration wait (now removed, but test if still needed)
- Optimize cache read/write operations
- Resource blocking optimizations (block more types?)
- Skip scrolling if we know card is near the top
