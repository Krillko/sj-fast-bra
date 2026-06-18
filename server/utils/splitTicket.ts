/**
 * Split-ticket finder (hidden feature — see SPLIT.local.md, which is gitignored).
 *
 * SJ uses dynamic pricing, so buying a journey as two tickets on the *same physical
 * train* (split at an intermediate station) is sometimes cheaper than one end-to-end
 * ticket. This module finds such splits using only SJ's booking API.
 *
 * The trick: each departure leg carries a train number (`serviceName`). If a sub-segment
 * search returns a *direct* departure with the same train number, it's the same train,
 * and its `offers` give that segment's price. We try every catalogue station as a split
 * point; off-route ones simply don't return a matching train (and cost a single search).
 *
 * Everything leans hard on cache (the user can wait) to keep SJ load minimal.
 */

import { createSearch, getDepartures, getOffers, buildBookingUrl } from './sjApi';
import { resolveStationCode, STATION_UIC_CODES } from './stations';

const SEGMENT_TTL_MS = 3600000; // 1 hour
const RESULT_TTL_MS = 3600000; // 1 hour

export interface SplitSegment {
  from: string;
  to: string;
  price: number;
  departureTime: string;
  arrivalTime: string;
  bookingUrl: string;
}

export interface SplitOption {
  viaStation: string;
  segmentA: SplitSegment;
  segmentB: SplitSegment;
  total: number;
  saving: number;
}

export interface SplitResult {
  route: string;
  date: string;
  departureTime: string;
  trainNumber: string | null;
  basePrice: number | null;
  splits: SplitOption[];
  checkedCandidates: number;
  candidateCount: number;
  generatedAt: string;
  /** True when we couldn't analyse (not direct / no base price / train not found). */
  unavailable?: boolean;
  reason?: string;
}

interface CachedSegment {
  // `price: null` is a real, cached negative result (candidate not on this train).
  price: number | null;
  departureTime: string;
  arrivalTime: string;
  bookingUrl: string;
  timestamp: number;
}

/**
 * Resolve the 2nd-class price (and times) of a direct segment on a specific train number,
 * caching the result — including negatives — so candidates aren't re-probed.
 *
 * `pinDepartureTime` ties segment A to the exact base service (a train number can recur
 * across a day); segment B only needs the train-number match.
 */
async function priceSegment(
  fromName: string,
  toName: string,
  date: string,
  trainNumber: string,
  pinDepartureTime?: string
): Promise<CachedSegment> {
  const storage = useStorage('cache');
  const cacheKey = `split:seg:${fromName}:${toName}:${date}:${trainNumber}`;

  const cached = await storage.getItem<CachedSegment>(cacheKey);
  if (cached?.timestamp && Date.now() - cached.timestamp < SEGMENT_TTL_MS) {
    return cached;
  }

  const empty: CachedSegment = {
    price: null,
    departureTime: '',
    arrivalTime: '',
    bookingUrl: buildBookingUrl(fromName, toName, date),
    timestamp: Date.now(),
  };

  try {
    const originUic = resolveStationCode(fromName);
    const destUic = resolveStationCode(toName);
    const { departureSearchId, passengerListId } = await createSearch(originUic, destUic, date);
    const stubs = await getDepartures(departureSearchId);

    const match = stubs.find((s) =>
      s.changes === 0
      && s.trainNumbers[0] === trainNumber
      && (!pinDepartureTime || s.departureTime === pinDepartureTime)
    );

    if (!match) {
      await storage.setItem(cacheKey, empty);
      return empty;
    }

    const offers = await getOffers(match.departureId, passengerListId);
    const second = offers?.secondClass;
    const result: CachedSegment = {
      price: second?.available && second.price != null ? second.price : null,
      departureTime: match.departureTime,
      arrivalTime: match.arrivalTime,
      bookingUrl: buildBookingUrl(fromName, toName, date),
      timestamp: Date.now(),
    };
    await storage.setItem(cacheKey, result);
    return result;
  } catch (e) {
    console.warn(`  ✗ split segment ${fromName}→${toName} (${trainNumber}): ${e instanceof Error ? e.message : e}`);
    // Don't cache transient failures as negatives — let a later run retry.
    return { ...empty, timestamp: 0 };
  }
}

/**
 * Find cheaper same-train splits for a direct departure.
 *
 * @param from        origin station name (catalogue name)
 * @param to          destination station name
 * @param date        YYYY-MM-DD
 * @param departureTime HH:MM of the target direct departure
 * @param onProgress  optional (checked, total, foundSoFar) callback for SSE
 * @param options     noCache bypasses the result-level cache (segment caches still used)
 */
export async function findSplits(
  from: string,
  to: string,
  date: string,
  departureTime: string,
  onProgress?: (checked: number, total: number, found: number) => void,
  options?: { noCache?: boolean }
): Promise<SplitResult> {
  const storage = useStorage('cache');
  const config = useRuntimeConfig();
  const concurrency = config.sj?.splitConcurrency ?? 3;
  const maxCandidates = config.sj?.splitMaxCandidates ?? 40;

  const resultKey = `split:res:${from}:${to}:${date}:${departureTime}`;

  if (!options?.noCache) {
    const cached = await storage.getItem<SplitResult & { _ts: number }>(resultKey);
    if (cached?._ts && Date.now() - cached._ts < RESULT_TTL_MS) {
      console.log(`✓ Split cache HIT ${from}→${to} ${date} ${departureTime}`);
      // Replay progress so the UI's bar completes immediately on a cache hit.
      if (onProgress) onProgress(cached.candidateCount, cached.candidateCount, cached.splits.length);
      return cached;
    }
  }

  const startTime = Date.now();
  console.log(`🔪 Finding splits for ${from} → ${to} on ${date} @ ${departureTime}`);

  const fail = (reason: string): SplitResult => ({
    route: `${from} → ${to}`,
    date,
    departureTime,
    trainNumber: null,
    basePrice: null,
    splits: [],
    checkedCandidates: 0,
    candidateCount: 0,
    generatedAt: new Date().toISOString(),
    unavailable: true,
    reason,
  });

  // 1. Base journey: find the target direct departure, its train number and 2nd-class price.
  let trainNumber: string;
  let basePrice: number;
  try {
    const originUic = resolveStationCode(from);
    const destUic = resolveStationCode(to);
    const { departureSearchId, passengerListId } = await createSearch(originUic, destUic, date);
    const stubs = await getDepartures(departureSearchId);
    const base = stubs.find((s) => s.departureTime === departureTime);

    if (!base) return fail('Avgången hittades inte.');
    if (base.changes !== 0) return fail('Delning stöds endast för direkttåg.');
    if (!base.trainNumbers[0]) return fail('Tågnummer saknas för avgången.');
    trainNumber = base.trainNumbers[0];

    const baseOffers = await getOffers(base.departureId, passengerListId);
    if (!baseOffers?.secondClass.available || baseOffers.secondClass.price == null) {
      return fail('Inget grundpris i 2:a klass att jämföra med.');
    }
    basePrice = baseOffers.secondClass.price;
  } catch (e) {
    console.error('Split base lookup failed:', e);
    return fail('Kunde inte hämta avgångens grundpris.');
  }

  // 2. Candidate split stations: catalogue stations between origin and destination.
  const candidates = Object.keys(STATION_UIC_CODES)
    .filter((name) => name !== from && name !== to)
    .slice(0, maxCandidates);

  const splits: SplitOption[] = [];
  let checked = 0;
  if (onProgress) onProgress(0, candidates.length, 0);

  const evaluate = async(via: string): Promise<void> => {
    // Segment A must be the exact base service (pin departure time); skip early if not.
    const segA = await priceSegment(from, via, date, trainNumber, departureTime);
    if (segA.price == null) {
      checked++;
      if (onProgress) onProgress(checked, candidates.length, splits.length);
      return;
    }

    const segB = await priceSegment(via, to, date, trainNumber);
    if (segB.price != null) {
      const total = segA.price + segB.price;
      if (total < basePrice) {
        splits.push({
          viaStation: via,
          segmentA: { from, to: via, price: segA.price, departureTime: segA.departureTime, arrivalTime: segA.arrivalTime, bookingUrl: segA.bookingUrl },
          segmentB: { from: via, to, price: segB.price, departureTime: segB.departureTime, arrivalTime: segB.arrivalTime, bookingUrl: segB.bookingUrl },
          total,
          saving: basePrice - total,
        });
      }
    }

    checked++;
    if (onProgress) onProgress(checked, candidates.length, splits.length);
  };

  // Bounded concurrency pool over candidates.
  let cursor = 0;
  const worker = async(): Promise<void> => {
    while (cursor < candidates.length) {
      await evaluate(candidates[cursor++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));

  splits.sort((a, b) => a.total - b.total);

  const result: SplitResult & { _ts: number } = {
    route: `${from} → ${to}`,
    date,
    departureTime,
    trainNumber,
    basePrice,
    splits,
    checkedCandidates: checked,
    candidateCount: candidates.length,
    generatedAt: new Date().toISOString(),
    _ts: Date.now(),
  };

  await storage.setItem(resultKey, result);
  console.log(
    `✓ Split done in ${Date.now() - startTime}ms: ${splits.length} cheaper option(s) `
    + `over ${candidates.length} candidates (train ${trainNumber}, base ${basePrice} SEK)`
  );

  return result;
}
