/**
 * Mapping of SJ station display names to their UIC station codes.
 *
 * The SJ booking API (prod-api.adp.sj.se) identifies stations by UIC code,
 * not by name. The frontend passes the human-readable `stationName` from
 * `app/utils/cities.ts`; this map resolves those names to the codes the API
 * expects.
 *
 * Codes were extracted from SJ's own station catalogue (the same data that
 * powers the station picker on sj.se). Keep the keys in sync with the
 * `stationName` values in `app/utils/cities.ts`.
 *
 * Note: a few cities have no SJ rail station and resolve to their main SJ
 * stop instead (e.g. Skellefteå → bus station, Södertälje → Södertälje Syd).
 */
export const STATION_UIC_CODES: Record<string, string> = {
  'Stockholm Central': '740000001',
  'Göteborg Central': '740000002',
  'Malmö Central': '740000003',
  'Uppsala Central': '740000005',
  'Alvesta': '740000004',
  'Avesta Krylbo': '740000111',
  'Borås Central': '740000300',
  'Borlänge Central': '740000160',
  'Eskilstuna Central': '740000170',
  'Falkenberg': '740001579',
  'Falun Central': '740000030',
  'Flen': '740000288',
  'Gävle Central': '740000210',
  'Halmstad Central': '740000080',
  'Hallsberg': '740000077',
  'Hässleholm Central': '740000006',
  'Helsingborg Central': '740000044',
  'Hudiksvall': '740000187',
  'Jönköping Central': '740000090',
  'Kalmar Central': '740000020',
  'Karlskrona Central': '740000230',
  'Karlstad Central': '740000070',
  'Katrineholm Central': '740000166',
  'Kiruna': '740001602',
  'Kristianstad Central': '740000200',
  'Kumla': '740000192',
  'Landskrona': '740001554',
  'Lidköping': '740000148',
  'Linköping Central': '740000009',
  'Ludvika': '740000291',
  'Lund Central': '740000120',
  'Mjölby': '740000180',
  'Mora': '740000302',
  'Motala': '740000172',
  'Nässjö Central': '740000140',
  'Norrköping Central': '740000007',
  'Nyköping Central': '740000050',
  'Sandviken': '740000195',
  'Skellefteå': '740000053',
  'Skövde Central': '740000008',
  'Södertälje Central': '740000055',
  'Sundsvall Central': '740000130',
  'Trelleborg Central': '740000088',
  'Trollhättan Central': '740000191',
  'Uddevalla Central': '740000119',
  'Umeå Central': '740000190',
  'Varberg': '740000110',
  'Västerås Central': '740000099',
  'Växjö Central': '740000250',
  'Ängelholm': '740000064',
  'Örebro Central': '740000133',
  'Östersund Central': '740000123',
};

/**
 * Resolve a station display name to its UIC code.
 * Throws if the station is unknown so callers fail fast with a clear message.
 */
export function resolveStationCode(stationName: string): string {
  const code = STATION_UIC_CODES[stationName];
  if (!code) {
    throw new Error(`Unknown station: "${stationName}". Add its UIC code to server/utils/stations.ts`);
  }
  return code;
}
