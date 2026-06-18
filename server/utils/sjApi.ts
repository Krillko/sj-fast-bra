/**
 * SJ booking API client.
 *
 * SJ.se is a thin client over a public JSON API (Azure API Management) at
 * prod-api.adp.sj.se. This module talks to that API directly instead of
 * scraping the rendered page with a headless browser, which is dramatically
 * faster and not subject to the per-IP "8 departures" block that the
 * browser-navigation approach hit (see HISTORY.md).
 *
 * Request flow (no login, no cookies — `credentials: omit` equivalent):
 *   1. POST   /public/sales/booking/v3/search                       → { departureSearchId, passengerListId }
 *   2. GET    /public/sales/booking/v3/departures/search/{id}        → all departures (no prices)
 *   3. GET    /public/sales/booking/v3/departures/{depId}/offers     → per-departure prices
 *
 * Auth is a single static `Ocp-Apim-Subscription-Key` header — a public value
 * baked into SJ's frontend bundle. We default to the known value but
 * auto-extract a fresh one from sj.se if it ever returns 401 (key rotation).
 */

// ---- Shared types (kept compatible with the existing scrape result shape) ----

export interface PriceInfo {
  price: number | null;
  available: boolean;
}

export interface Departure {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  changes: number;
  operator: string;
  prices: {
    secondClass: PriceInfo;
    secondClassCalm: PriceInfo;
    firstClass: PriceInfo;
  };
  bookingUrl: string;
}

/** A departure from the list endpoint, before prices are fetched. */
export interface DepartureStub {
  departureId: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  changes: number;
  operator: string;
  /**
   * Train numbers per leg (`serviceName`, e.g. ["519"]). For a direct train this is a
   * single entry — the physical train identifier used by the split-ticket finder to
   * confirm a sub-segment is on the *same* train. See SPLIT.local.md.
   */
  trainNumbers: string[];
}

interface SjRuntime {
  apiHost: string;
  subscriptionKey: string;
  clientName: string;
  clientVersion: string;
  offersConcurrency: number;
}

// Working subscription key discovered at runtime (overrides config after a
// successful auto-extraction). Module-level so it persists across requests.
let resolvedKey: string | null = null;

function getConfig(): SjRuntime {
  const config = useRuntimeConfig();
  if (!config.sj?.apiHost) {
    throw new Error('SJ API config missing from runtimeConfig.sj');
  }
  return config.sj as SjRuntime;
}

function buildHeaders(cfg: SjRuntime): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Ocp-Apim-Trace': 'true',
    'Ocp-Apim-Subscription-Key': resolvedKey ?? cfg.subscriptionKey,
    'x-client-name': cfg.clientName,
    'x-client-version': cfg.clientVersion,
    'Accept-Language': 'en-GB',
  };
}

function bookingBase(cfg: SjRuntime): string {
  return `${cfg.apiHost}/public/sales/booking/v3`;
}

/**
 * Fetch helper that retries once with a refreshed subscription key if the API
 * responds 401 (handles SJ rotating the key in a new frontend deploy). The
 * refreshed key is persisted in KV so the discovery cost is paid once, not per
 * request/isolate.
 */
async function apiFetch(url: string, init: RequestInit, cfg: SjRuntime): Promise<Response> {
  let resp = await fetch(url, { ...init, headers: { ...buildHeaders(cfg), ...(init.headers || {}) } });

  if (resp.status === 401) {
    const usedKey = resolvedKey ?? cfg.subscriptionKey;
    console.warn('⚠️  SJ API returned 401 — refreshing subscription key');
    const fresh = await refreshSubscriptionKey(usedKey, cfg);
    if (fresh && fresh !== usedKey) {
      resolvedKey = fresh;
      console.log('✓ Using refreshed SJ subscription key');
      resp = await fetch(url, { ...init, headers: { ...buildHeaders(cfg), ...(init.headers || {}) } });
    }
  }

  return resp;
}

// ---- Core API calls ----

/** Create a search session. Returns the ids needed for the subsequent calls. */
export async function createSearch(
  originUic: string,
  destinationUic: string,
  date: string,
  cfg: SjRuntime = getConfig()
): Promise<{ departureSearchId: string; passengerListId: string }> {
  const resp = await apiFetch(`${bookingBase(cfg)}/search`, {
    method: 'POST',
    body: JSON.stringify({
      origin: originUic,
      destination: destinationUic,
      departureDate: date,
      returnDate: '',
      passengers: [{ passengerCategory: { type: 'ADULT' } }],
    }),
  }, cfg);

  if (!resp.ok) {
    throw new Error(`SJ createSearch failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }

  const json = await resp.json();
  if (!json.departureSearchId || !json.passengerListId) {
    throw new Error('SJ createSearch response missing ids');
  }
  return { departureSearchId: json.departureSearchId, passengerListId: json.passengerListId };
}

/** Fetch the full list of departures (without prices) for a search. */
export async function getDepartures(
  departureSearchId: string,
  cfg: SjRuntime = getConfig()
): Promise<DepartureStub[]> {
  const resp = await apiFetch(`${bookingBase(cfg)}/departures/search/${departureSearchId}`, {
    method: 'GET',
  }, cfg);

  if (!resp.ok) {
    throw new Error(`SJ getDepartures failed: ${resp.status}`);
  }

  const json = await resp.json();
  const departures = json.travels?.[0]?.departures ?? [];
  return departures.map(mapDepartureStub);
}

/** Fetch the offers (prices) for a single departure. */
export async function getOffers(
  departureId: string,
  passengerListId: string,
  cfg: SjRuntime = getConfig()
): Promise<{
  secondClass: PriceInfo;
  secondClassCalm: PriceInfo;
  firstClass: PriceInfo;
} | null> {
  const url = `${bookingBase(cfg)}/departures/${departureId}/offers?passengerListId=${passengerListId}`;
  try {
    const resp = await apiFetch(url, { method: 'GET' }, cfg);
    if (!resp.ok) {
      console.warn(`  ✗ offers ${departureId} → ${resp.status}`);
      return null;
    }
    return mapOffers(await resp.json());
  } catch (e) {
    // A transient network error (e.g. "fetch failed") on one departure must not
    // sink the whole route — treat it as a failed departure (caller marks incomplete).
    console.warn(`  ✗ offers ${departureId} → ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

// ---- Mapping helpers ----

/** Parse ISO 8601 duration (e.g. "PT4H31M") into "4 h 31 min". */
function parseDuration(iso: string): string {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return '';
  const hours = Number.parseInt(m[1] ?? '0', 10);
  const minutes = Number.parseInt(m[2] ?? '0', 10);
  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

/** Time portion (HH:MM) from an ISO datetime with timezone offset. */
function timeOf(isoDateTime: string): string {
  // e.g. "2026-06-24T05:22:00+02:00" → "05:22"
  return isoDateTime?.slice(11, 16) ?? '';
}

function mapDepartureStub(dep: {
  departureId: string;
  departureDateTime: string;
  arrivalDateTime: string;
  duration: string;
  numberOfChanges: number;
  legs?: Array<{ serviceName?: string; publicServiceName?: string; serviceType?: { name?: string; description?: string } }>;
}): DepartureStub {
  // Operator: unique service-type names across legs, joined (e.g. "SJ Snabbtåg + SJ Regional").
  const names = (dep.legs ?? [])
    .map((l) => l.serviceType?.name || l.serviceType?.description)
    .filter((n): n is string => !!n);
  const operator = [...new Set(names)].join(' + ');

  // Train numbers per leg — the physical-train identifier used for split matching.
  const trainNumbers = (dep.legs ?? [])
    .map((l) => l.serviceName || l.publicServiceName)
    .filter((n): n is string => !!n);

  return {
    departureId: dep.departureId,
    departureTime: timeOf(dep.departureDateTime),
    arrivalTime: timeOf(dep.arrivalDateTime),
    duration: parseDuration(dep.duration),
    changes: dep.numberOfChanges ?? 0,
    operator,
    trainNumbers,
  };
}

interface ClassOffer {
  available?: boolean;
  priceFrom?: { price?: string | number } | null;
}

function priceInfo(classOffer: ClassOffer | undefined): PriceInfo {
  if (!classOffer || !classOffer.available || classOffer.priceFrom == null) {
    return { price: null, available: false };
  }
  const raw = classOffer.priceFrom.price;
  const price = typeof raw === 'number' ? raw : Number.parseInt(String(raw).replace(/[^\d]/g, ''), 10);
  return { price: Number.isNaN(price) ? null : price, available: true };
}

function mapOffers(json: {
  seatOffers?: { offers?: Record<string, ClassOffer> };
  bedOffers?: { offers?: Record<string, ClassOffer>; available?: boolean; priceFrom?: { price?: string | number } };
}): { secondClass: PriceInfo; secondClassCalm: PriceInfo; firstClass: PriceInfo } {
  const seat = json.seatOffers?.offers ?? {};
  const prices = {
    secondClass: priceInfo(seat.SECOND),
    secondClassCalm: priceInfo(seat.SECOND_CALM),
    firstClass: priceInfo(seat.FIRST),
  };

  // Night trains have no seat offers — surface the cheapest bed price in the
  // second-class slot so the user still sees a price.
  const noSeatPrices = !prices.secondClass.available && !prices.secondClassCalm.available && !prices.firstClass.available;
  if (noSeatPrices && json.bedOffers?.available && json.bedOffers.priceFrom != null) {
    prices.secondClass = priceInfo({ available: true, priceFrom: json.bedOffers.priceFrom });
  }

  return prices;
}

/** Build the "Book this train" deep link (ticket selection page). */
export function buildBookingUrl(from: string, to: string, date: string): string {
  return `https://www.sj.se/en/search-journey/choose-ticket-type/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date}/outward-journey`;
}

// ---- Subscription key auto-extraction (fallback for key rotation) ----

const KEY_CACHE_KEY = 'sj:apikey';
// In-isolate guard so concurrent 401s trigger a single crawl, not one each.
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Produce a working subscription key after a 401, cheaply where possible:
 *   1. Another isolate may already have discovered + cached the new key in KV.
 *   2. Otherwise crawl SJ's bundle (bounded) for it and persist the result.
 * `failedKey` is the key that just 401'd — we never return it.
 */
function refreshSubscriptionKey(failedKey: string, cfg: SjRuntime): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async() => {
    try {
      const storage = useStorage('cache');

      // 1. KV may already hold a fresh key written by another request/isolate.
      const cached = await storage.getItem<{ key: string; ts: number }>(KEY_CACHE_KEY).catch(() => null);
      if (cached?.key && cached.key !== failedKey) {
        return cached.key;
      }

      // 2. Discover from the live bundle, then persist for everyone else.
      const found = await crawlForWorkingKey(cfg, failedKey);
      if (found) {
        await storage.setItem(KEY_CACHE_KEY, { key: found, ts: Date.now() }).catch(() => {});
        return found;
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Bounded crawl of SJ's frontend bundle to find a subscription key that
 * authenticates against the booking API. Stays well under Cloudflare's
 * 50-external-subrequest-per-request free-tier limit: it follows only
 * relevant chunks (config/api bundles) and stops as soon as it has a fresh,
 * validated candidate. Returns null if none found within the budget.
 */
async function crawlForWorkingKey(cfg: SjRuntime, failedKey: string): Promise<string | null> {
  const ORIGIN = 'https://www.sj.se';
  const MAX_FETCH = 20; // hard cap on chunk fetches (subrequest budget)
  // Only follow chunks likely to carry the key or lead to it (SJ's config/api/app bundles).
  const RELEVANT = /constants|env|hooks|api|booking|sales|container|common/i;
  const ua = { 'User-Agent': 'Mozilla/5.0' };
  const get = (u: string) => fetch(u, { headers: ua }).then((r) => (r.ok ? r.text() : '')).catch(() => '');

  const scan = (js: string, into: Set<string>) => {
    for (const m of js.matchAll(/Ocp-Apim-Subscription-Key["']?\s*[:,]\s*[`"']([a-f0-9]{32})[`"']/gi)) into.add(m[1]);
    for (const m of js.matchAll(/(?:API_SUBSCRIPTION_KEY|subscriptionKey)\s*[:=]\s*[`"']([a-f0-9]{32})[`"']/gi)) into.add(m[1]);
  };
  const depsOf = (js: string, from: string) => [...js.matchAll(/["'](\.{0,2}\/[^"']*\.js)["']/g)]
    .map((m) => { try { return new URL(m[1], from).href; } catch { return null; } })
    .filter((u): u is string => !!u);

  try {
    const html = await get(`${ORIGIN}/en/search-journey`);
    const entry = html.match(/src="([^"]*main[^"]*\.js)"/)?.[1];
    if (!entry) return null;

    const seen = new Set<string>();
    const candidates = new Set<string>();
    const queue: string[] = [new URL(entry, ORIGIN).href];
    let fetched = 0;

    while (queue.length && fetched < MAX_FETCH) {
      // Prefer relevant chunks; the entry (main.js) is processed first regardless.
      let idx = queue.findIndex((u) => RELEVANT.test(u));
      if (idx < 0) idx = 0;
      const url = queue.splice(idx, 1)[0];
      if (seen.has(url)) continue;
      seen.add(url);

      const js = await get(url);
      fetched++;
      scan(js, candidates);
      // Stop crawling as soon as we have a candidate that isn't the known-bad key.
      if ([...candidates].some((c) => c !== failedKey)) break;

      for (const dep of depsOf(js, url)) {
        if (!seen.has(dep) && RELEVANT.test(dep)) queue.push(dep);
      }
    }

    // Validate fresh candidates (never the failed key) against a cheap search call.
    const fresh = [...candidates].filter((c) => c !== failedKey).slice(0, 3);
    for (const key of fresh) {
      const ok = await fetch(`${bookingBase(cfg)}/search`, {
        method: 'POST',
        headers: { ...buildHeaders(cfg), 'Ocp-Apim-Subscription-Key': key },
        body: JSON.stringify({
          origin: '740000001', destination: '740000003', departureDate: '2099-12-31',
          returnDate: '', passengers: [{ passengerCategory: { type: 'ADULT' } }],
        }),
      }).then((r) => r.status !== 401).catch(() => false);
      if (ok) return key;
    }
  } catch (e) {
    console.error('Key extraction failed:', e instanceof Error ? e.message : e);
  }
  return null;
}
