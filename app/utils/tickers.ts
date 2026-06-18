// Live "money ticker" definitions for the front page.
//
// Each ticker spreads a fixed amount of money evenly across a period (a month
// or a year) and counts up live based on how far into that period we are.
//
// To add a new ticker: append an entry to TICKERS below. No other changes needed.

export type TickerPeriod = 'month' | 'year';

export interface TickerDef {
  /** Stable id (used as the render key). */
  id: string;
  /** Which period the amount is spread across. */
  period: TickerPeriod;
  /** Total amount (SEK) earned/lost over one full period. */
  amountPerPeriod: number;
  /** i18n key for the text shown before the counting amount. */
  prefixKey: string;
  /** i18n key for the text shown after the counting amount (after the " kr" unit). */
  suffixKey?: string;
}

export const TICKERS: TickerDef[] = [
  {
    id: 'sj-ceo',
    period: 'month',
    amountPerPeriod: 519_000,
    prefixKey: 'tickers.sjCeo.prefix',
  },
  {
    id: 'bromma',
    period: 'year',
    amountPerPeriod: 100_000_000,
    prefixKey: 'tickers.bromma.prefix',
    suffixKey: 'tickers.bromma.suffix',
  },
];

/**
 * Returns how much of a ticker's amount has accrued at the given moment,
 * based on the fraction of the current period that has elapsed.
 */
export function computeTickerAmount(ticker: TickerDef, nowMs: number): number {
  const now = new Date(nowMs);
  const start = (ticker.period === 'month')
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), 0, 1);
  const end = (ticker.period === 'month')
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : new Date(now.getFullYear() + 1, 0, 1);

  const fraction = (nowMs - start.getTime()) / (end.getTime() - start.getTime());
  return ticker.amountPerPeriod * fraction;
}
