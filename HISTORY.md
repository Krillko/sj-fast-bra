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

## Soak test — 1 hour at small-site production load (2026-06-13)

**Goal:** Confirm the API approach isn't quietly rate-limited/blocked under sustained,
realistic traffic (the thing that killed every browser approach).

**Setup:** A load generator (`/tmp/loadtest.mjs`) hit the real `/api/scrape` endpoint
(caching on, as in production) for 60 minutes: ~4 visitors/min, top-4-station-weighted
routes, dates mostly within 12 days, ~30% of visitors refining (+1 day). Cache cleared
first for a cold start.

**Result:** ✅ **No anti-scraping. 309/310 requests `200 OK`.**

| Metric | Value |
| --- | --- |
| Total requests (incl. refinements) | 310 |
| Successful (200) | 309 |
| Departures priced in total | 12,356 |
| 401 / 403 / 429 (block signals) | **0** |
| Empty / incomplete results | **0 / 0** |
| Key auto-refreshes triggered | 0 |
| Avg / max latency | 3.2s / 15s |
| Failures | 1 (transient `fetch failed`, recovered next request) |

No escalation, no clustering, no "fails after N then stays failed" pattern — the
opposite of the old per-IP block. Big routes (up to 77 departures) succeeded fully.

**Bug the test surfaced (fixed):** the one failure was a transient network error on a
*single* offers call, which threw and 500'd the *entire* route. `getOffers` now catches
thrown network errors and returns `null`, so a flaky single call just drops that
departure and marks the result `incomplete` instead of sinking the whole search.

**Conclusion:** Safe to rely on at small-site volume. With production caching, real load
on SJ is lower than this test (which cold-started and used high date entropy).

---

## Subscription-key self-healing — hardened for Cloudflare (2026-06-13)

**Context:** The `Ocp-Apim-Subscription-Key` is a public, long-lived APIM key baked into
SJ's frontend bundle — not a session token, so unlikely to rotate often, but it *can*
change on a redeploy/security refresh. `sjApi.ts` already had a fallback that crawls the
bundle for a fresh key on a 401, but it was written for Node and unsafe on Cloudflare:

- It crawled up to ~300 JS files → ~300 `fetch`es in one request, blowing the **free-tier
  50-external-subrequest-per-request limit**, so a real rotation would *not* self-heal in
  production.
- It cached the found key only in per-isolate memory (Workers isolates are ephemeral →
  re-discovered constantly).

**Hardening:**
- **Lean crawl:** follow only SJ's config/api chunks (`constants|env|hooks|api|booking|
  sales|container|common`) and stop at the first valid candidate. Bounded to 20 chunk
  fetches; in practice it finds the key after **7** (~9 external subrequests for a full
  recovery — well under 50).
- **KV-persisted key** (`sj:apikey`): the discovered key is written to KV so the crawl
  cost is paid once and shared across all requests/isolates; later 401s just read it.
- The committed default key is always tried first (zero overhead on the normal path), an
  in-isolate guard collapses concurrent 401s into one crawl, and the just-failed key is
  never re-returned (avoids sticking on a stale key).

**Verified:** simulated a rotation against the live site (fake failed key) → found and
validated the real key after 7 fetches. Redeployed; production unaffected.

**Result:** ✅ If SJ rotates the key, the next request discovers the new one, caches it in
KV, and self-heals — within the free-tier budget, no manual intervention.

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

---

## 2026-06-18 — No per-departure booking deep link on sj.se (Book button removed)

**Question:** Can the per-row "Book" button link to a *specific* departure on sj.se?

**Investigated** the live booking flow via Chrome:
- Searched a route, then clicked individual departures. The URL never changes —
  it stays the generic `.../choose-ticket-type/{from}/{to}/{date}/outward-journey`
  with **no departure id** in the path or query. The selected train is held in
  **client state (sessionStorage), not the URL.**
- Opening `choose-ticket-type/.../outward-journey` fresh (no client state, even a
  brand-new tab / different route) **redirects** to
  `choose-journey/{from}/{to}/{date}` — the route+date departure *list*.
- `choose-journey/{from}/{to}/{date}` is the clean canonical URL (no redirect) but
  still only the list — there is no URL that pre-selects one train.

**Conclusion:** Per-departure deep-linking is **impossible** via URL. A per-row Book
button can only ever land the user on the full route/date list.

**Decision:** Per the owner, the Book buttons (main results table, Favoriter table,
and split-ticket "Book leg") were **commented out** (not deleted — easy to restore)
in `app/pages/[date]/[from]/[to].vue`, along with their table column headers so the
layout stays aligned. The `bookingUrl` field / `buildBookingUrl()` plumbing is left
intact. If SJ ever exposes a departure id in the URL, uncomment and switch the link.
