# Project History — How We Get Train Data from SJ

This is the single record of every approach we've tried to pull schedules + prices
from SJ.se, why each one failed or succeeded, and what we learned. It replaces the
old `PLAN.md`, `PERFORMANCE_TESTS.md`, `SJ-SCRAPING-FINDINGS.md`, and
`SESSION_SUMMARY_*.md` documents.

**TL;DR — current approach (✅ in production):** We call SJ's public booking JSON API
directly (`prod-api.adp.sj.se`). No browser, no login, no per-IP limit. All
departures for a route come back with full pricing in ~2 seconds. See the last
section for details; everything above it is history kept so we don't re-test dead ends.

---

## The problem we were solving

SJ.se shows train times on a search-results page but **no prices** — historically you
had to click each departure to reach a ticket-selection page that revealed prices for
three classes (2nd, 2nd Calm, 1st). The site is a client-side-rendered SPA, so the
original assumption was that we needed a headless browser to drive it.

Test route throughout: **Stockholm C → Malmö C** (enough departures to require
"load more", but not an extreme count like Stockholm→Uppsala).

---

## Attempt 1 — Puppeteer prototype (2025-12)

**Approach:** Headless Chrome (Puppeteer). Navigate to the results page, scroll to
trigger lazy-loading of all departure cards, then for each card: click → read prices
on the ticket page → navigate back → repeat.

**Result:** ⚠️ Worked, but horribly slow (~35–120s for a route) — first working
prototype at commit `13c552c`. Got **all** departures.

**Lesson:** Functional baseline, but the click-through-every-departure model was the
root of everything slow and fragile that followed.

---

## Attempt 2 — Navigation & scroll tuning (2026-01-12)

Added timing instrumentation + a local "Stop" button, then tried to speed up the
per-departure loop:

- **`page.goBack()` instead of reload** → *slower* (mandatory re-scroll cost ~5s) and
  the DOM went stale after several back-navigations. Reverted.
- **Reload + fast scroll (300ms)** → more stable than back-nav, modestly faster.

**Lesson:** Always reload the results page (`page.goto`) rather than `goBack()`; the
SPA's DOM is unreliable after back navigation.

---

## Attempt 3 — The "#9" wall: counter-based blocking (2026-01-12)

**Finding:** The scraper **always failed on the 9th departure** with a navigation
timeout — on every date, every route. Proven it was position-based, not a specific
train: skipping the problematic departure just moved the failure to the new #9.

- Adding 2s delays between departures: didn't help.
- Raising the timeout to 90s: didn't help (it's a block, not slowness).

**Workaround tried:** Restart the browser every 8 departures to reset the counter.

**Lesson:** SJ blocks after exactly **8 successful departure-detail loads**. Not
time-based, not fixable with delays.

---

## Attempt 4 — DOM-stability / anti-bot flags (2026-01-23)

Tried `--incognito`, `--disable-blink-features=AutomationControlled`, longer hydration
waits, explicit `waitForFunction` for cards, selective resource blocking.

**Result:** ❌ Didn't move the limit. Reverted.

**Lesson:** Cosmetic anti-detection flags don't address the actual block.

---

## Attempt 5 — Cards-already-in-DOM + parallel scrapers (2026-01-28)

Two discoveries this session:

1. **All departure cards are already in the DOM** before scrolling (verified in
   offline mode) — incremental scrolling was wasting 5+ seconds per departure. A
   single fast scroll cut per-departure time from ~7–8s to ~2.2s (**73% faster**)…
   but the run then failed on departure **#2** (clicks started hitting the wrong
   element). Anti-scraping appeared to mutate page state after the first success.

2. **Parallel single-departure scrapers:** one fresh, fully isolated browser per
   departure (no shared cookies/session/back-navigation).

**Result:** ❌ Cleaner architecture, but the **8-departure limit persisted across
completely independent browsers from the same IP**. Confirmed the block is **per-IP**,
not per-session/cookie.

**Conclusion at the time:** Believed we were stuck at 8 departures without proxy
rotation. (This conclusion turned out to be wrong — see Attempt 6.)

---

## Attempt 6 — Direct API, no browser ✅ (2026-06-13) — CURRENT

**Hypothesis:** The per-IP "8" block targets the *rendered booking flow*
(DOM clicks, page reloads, browser fingerprint) — not the API the frontend calls.
Skip the browser and hit the API directly.

**Investigation** (Chrome DevTools network capture on sj.se): the site is a thin
client over an Azure API Management backend at `prod-api.adp.sj.se`. Three JSON calls
produce everything — no browser, no login, no cookies.

**The decisive test:** fetched offers for **all 20** Stockholm→Malmö departures
directly → **20/20 returned `200 OK`** (departures 9–20 included). The "8 limit" was
purely a browser-navigation artifact. It does not exist for direct API calls.

**Measured:**

| Route | Old (Puppeteer) | New (API) |
| --- | --- | --- |
| Stockholm→Malmö | 8 max, 20–90s | 19–24 departures, ~1.7s |
| Stockholm→Uppsala | impossible (>8) | all 76 departures |
| Cached repeat | — | ~8ms |

**Result:** ✅ Adopted as the architecture. Puppeteer removed entirely (the dependency,
`server/utils/puppeteer.ts`, and the `test-*.mjs` scripts). Revertable via git history.

---

## Current architecture (the details)

**Client:** `server/utils/sjApi.ts`. **Station codes:** `server/utils/stations.ts`
(52 stations, name → UIC). **Orchestration + caching:** `server/api/scrape.ts`,
streamed via `server/api/scrape-stream.ts` (SSE).

### The 3 API calls

1. `POST /public/sales/booking/v3/search`
   Body: `{ origin, destination, departureDate, returnDate: "", passengers: [{ passengerCategory: { type: "ADULT" } }] }`
   `origin`/`destination` are **UIC codes** (Stockholm C `740000001`, Malmö C `740000003`).
   → `{ departureSearchId, passengerListId }`

2. `GET /public/sales/booking/v3/departures/search/{departureSearchId}`
   → all departures (times, duration, `numberOfChanges`, legs with `serviceType`). No prices.

3. `GET /public/sales/booking/v3/departures/{departureId}/offers?passengerListId={passengerListId}`
   (one per departure, concurrency 5)
   → `seatOffers.offers.{SECOND, SECOND_CALM, FIRST}.priceFrom.price` + `.available`,
     `bedOffers` for night trains, and a convenience `priceFrom`.

### Authentication

One static header, `Ocp-Apim-Subscription-Key` — a **public** value baked into SJ's
frontend bundle (an Azure APIM client id, not a user credential; every visitor's
browser sends it). Configured in `runtimeConfig.sj.subscriptionKey` (override via
`SJ_SUBSCRIPTION_KEY`). If it ever returns 401 (SJ rotating it in a deploy), `sjApi.ts`
**auto-extracts a fresh key** from the JS bundle and retries.

### Edge cases

- **Night trains** have no seat offers → cheapest `bedOffers` price is shown in the
  2nd-class slot.
- **Multi-leg journeys**: `operator` is the unique `serviceType` names joined with
  " + " (e.g. "SJ Nattåg + SJ InterCity").
- Already-departed trains are filtered out (5-min buffer).
- High-frequency routes (Stockholm→Uppsala ≈ 76 departures) issue one offers call each
  at concurrency 5 — a few seconds, but be mindful of load.

### Why this works where scraping failed

We make the **same requests the website's own frontend makes**, at lower volume and
with caching. SJ's anti-scraping defended the rendered booking flow, not the public
API behind it.

---

## Ground rules learned

- **Don't reintroduce browser scraping** for prices — the API is faster and unlimited.
- **Diplomatic first:** SJ is a state-owned public service. This is read-only public
  pricing data via the site's own API. If access ever breaks, prefer requesting
  official API access over aggressive workarounds.
- **This is a living document — keep adding to it.** Whenever you test a new approach,
  optimization, or workaround, or learn something notable about how SJ's API/site
  behaves, append a dated section (hypothesis, what changed, measurements, keep/revert
  decision). Record failures too — that's exactly what stops us re-testing dead ends.
