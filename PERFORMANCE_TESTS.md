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

## Future Tests

Document all future performance experiments below, even if they fail.

### Ideas to Test
- Reduce timeout values (test if lower values still work reliably)
- Parallel departure processing (risky - may trigger anti-scraping)
- Different `waitUntil` strategies (`domcontentloaded` vs `networkidle0`)
- Remove the 500ms hydration wait after navigate back
- Optimize cache read/write operations
- Resource blocking optimizations (block more types?)
