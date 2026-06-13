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
 * Fetch helper that retries once with a freshly extracted subscription key if
 * the API responds 401 (handles SJ rotating the key in a new frontend deploy).
 */
async function apiFetch(url: string, init: RequestInit, cfg: SjRuntime): Promise<Response> {
  let resp = await fetch(url, { ...init, headers: { ...buildHeaders(cfg), ...(init.headers || {}) } });

  if (resp.status === 401) {
    console.warn('⚠️  SJ API returned 401 — attempting to refresh subscription key from sj.se');
    const fresh = await extractWorkingSubscriptionKey(cfg);
    if (fresh) {
      resolvedKey = fresh;
      console.log('✓ Refreshed SJ subscription key');
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
  legs?: Array<{ serviceType?: { name?: string; description?: string } }>;
}): DepartureStub {
  // Operator: unique service-type names across legs, joined (e.g. "SJ Snabbtåg + SJ Regional").
  const names = (dep.legs ?? [])
    .map((l) => l.serviceType?.name || l.serviceType?.description)
    .filter((n): n is string => !!n);
  const operator = [...new Set(names)].join(' + ');

  return {
    departureId: dep.departureId,
    departureTime: timeOf(dep.departureDateTime),
    arrivalTime: timeOf(dep.arrivalDateTime),
    duration: parseDuration(dep.duration),
    changes: dep.numberOfChanges ?? 0,
    operator,
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

/**
 * Crawl SJ's frontend JS bundle and return a subscription key that
 * authenticates against the booking API. Used only when the configured key
 * returns 401. Returns null if no working key is found.
 */
async function extractWorkingSubscriptionKey(cfg: SjRuntime): Promise<string | null> {
  try {
    const ua = { 'User-Agent': 'Mozilla/5.0' };
    const html = await fetch('https://www.sj.se/en/search-journey', { headers: ua }).then((r) => r.text());
    const entry = html.match(/src="([^"]*main[^"]*\.js)"/)?.[1];
    if (!entry) return null;

    const seen = new Set<string>();
    const queue = [new URL(entry, 'https://www.sj.se').href];
    const candidates = new Set<string>();
    let checked = 0;

    while (queue.length && checked < 300) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const js = await fetch(url, { headers: ua }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
      checked++;

      // Keys are template-literal 32-char hex strings near the header name or in env defs.
      for (const m of js.matchAll(/Ocp-Apim-Subscription-Key["']?\s*[:,]\s*[`"']([a-f0-9]{32})[`"']/gi)) {
        candidates.add(m[1]);
      }
      for (const m of js.matchAll(/API_SUBSCRIPTION_KEY\s*[:=]\s*[`"']([a-f0-9]{32})[`"']/gi)) {
        candidates.add(m[1]);
      }

      // Follow relative .js imports.
      for (const m of js.matchAll(/["'](\.{0,2}\/[^"']*\.js)["']/g)) {
        try {
          const dep = new URL(m[1], url).href;
          if (!seen.has(dep)) queue.push(dep);
        } catch { /* ignore malformed */ }
      }
    }

    // Validate candidates against a cheap search call; return the first that works.
    for (const key of candidates) {
      const ok = await fetch(`${bookingBase(cfg)}/search`, {
        method: 'POST',
        headers: { ...buildHeaders(cfg), 'Ocp-Apim-Subscription-Key': key },
        body: JSON.stringify({
          origin: '740000001', destination: '740000003', departureDate: '2099-01-01',
          returnDate: '', passengers: [{ passengerCategory: { type: 'ADULT' } }],
        }),
      }).then((r) => r.status !== 401).catch(() => false);
      if (ok) return key;
    }
  } catch (e) {
    console.error('Subscription key extraction failed:', e instanceof Error ? e.message : e);
  }
  return null;
}
