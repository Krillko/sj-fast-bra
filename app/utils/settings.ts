/**
 * Application settings and configuration constants
 */

export const SETTINGS = {
  /**
   * Time-to-live for favorite departures in milliseconds
   * Default: 3 days (259200000 ms)
   */
  FAVORITES_TTL_MS: 3 * 24 * 60 * 60 * 1000,
} as const;
