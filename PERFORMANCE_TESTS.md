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

**Measurements**: [To be added after testing]

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
