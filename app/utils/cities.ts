/**
 * Swedish train stations (50 stations)
 * Top 4 cities are prioritized, rest sorted alphabetically
 * Each city has an ID (slug), translation key, SJ station name, and UIC code.
 *
 * The `uicStationCode` is what the SJ booking API expects; the server-side
 * lookup lives in `server/utils/stations.ts` keyed by `stationName`.
 */
export interface City {
  id: string;
  translationKey: string;
  stationName: string;
  uicStationCode: string;
}

export const SWEDISH_CITIES: City[] = [
  // Top 4 prioritized cities
  { id: 'stockholm', translationKey: 'cities.stockholm', stationName: 'Stockholm Central', uicStationCode: '740000001' },
  { id: 'goteborg', translationKey: 'cities.goteborg', stationName: 'Göteborg Central', uicStationCode: '740000002' },
  { id: 'malmo', translationKey: 'cities.malmo', stationName: 'Malmö Central', uicStationCode: '740000003' },
  { id: 'uppsala', translationKey: 'cities.uppsala', stationName: 'Uppsala Central', uicStationCode: '740000005' },

  // Rest sorted alphabetically (Swedish order: å, ä, ö at the end)
  { id: 'alvesta', translationKey: 'cities.alvesta', stationName: 'Alvesta', uicStationCode: '740000004' },
  { id: 'avesta', translationKey: 'cities.avesta', stationName: 'Avesta Krylbo', uicStationCode: '740000111' },
  { id: 'boras', translationKey: 'cities.boras', stationName: 'Borås Central', uicStationCode: '740000300' },
  { id: 'borlange', translationKey: 'cities.borlange', stationName: 'Borlänge Central', uicStationCode: '740000160' },
  { id: 'eskilstuna', translationKey: 'cities.eskilstuna', stationName: 'Eskilstuna Central', uicStationCode: '740000170' },
  { id: 'falkenberg', translationKey: 'cities.falkenberg', stationName: 'Falkenberg', uicStationCode: '740001579' },
  { id: 'falun', translationKey: 'cities.falun', stationName: 'Falun Central', uicStationCode: '740000030' },
  { id: 'flen', translationKey: 'cities.flen', stationName: 'Flen', uicStationCode: '740000288' },
  { id: 'gavle', translationKey: 'cities.gavle', stationName: 'Gävle Central', uicStationCode: '740000210' },
  { id: 'halmstad', translationKey: 'cities.halmstad', stationName: 'Halmstad Central', uicStationCode: '740000080' },
  { id: 'hallsberg', translationKey: 'cities.hallsberg', stationName: 'Hallsberg', uicStationCode: '740000077' },
  { id: 'hassleholm', translationKey: 'cities.hassleholm', stationName: 'Hässleholm Central', uicStationCode: '740000006' },
  { id: 'helsingborg', translationKey: 'cities.helsingborg', stationName: 'Helsingborg Central', uicStationCode: '740000044' },
  { id: 'hudiksvall', translationKey: 'cities.hudiksvall', stationName: 'Hudiksvall', uicStationCode: '740000187' },
  { id: 'jonkoping', translationKey: 'cities.jonkoping', stationName: 'Jönköping Central', uicStationCode: '740000090' },
  { id: 'kalmar', translationKey: 'cities.kalmar', stationName: 'Kalmar Central', uicStationCode: '740000020' },
  { id: 'karlskrona', translationKey: 'cities.karlskrona', stationName: 'Karlskrona Central', uicStationCode: '740000230' },
  { id: 'karlstad', translationKey: 'cities.karlstad', stationName: 'Karlstad Central', uicStationCode: '740000070' },
  { id: 'katrineholm', translationKey: 'cities.katrineholm', stationName: 'Katrineholm Central', uicStationCode: '740000166' },
  { id: 'kiruna', translationKey: 'cities.kiruna', stationName: 'Kiruna', uicStationCode: '740001602' },
  { id: 'kristianstad', translationKey: 'cities.kristianstad', stationName: 'Kristianstad Central', uicStationCode: '740000200' },
  { id: 'kumla', translationKey: 'cities.kumla', stationName: 'Kumla', uicStationCode: '740000192' },
  { id: 'landskrona', translationKey: 'cities.landskrona', stationName: 'Landskrona', uicStationCode: '740001554' },
  { id: 'lidkoping', translationKey: 'cities.lidkoping', stationName: 'Lidköping', uicStationCode: '740000148' },
  { id: 'linkoping', translationKey: 'cities.linkoping', stationName: 'Linköping Central', uicStationCode: '740000009' },
  { id: 'ludvika', translationKey: 'cities.ludvika', stationName: 'Ludvika', uicStationCode: '740000291' },
  { id: 'lund', translationKey: 'cities.lund', stationName: 'Lund Central', uicStationCode: '740000120' },
  { id: 'mjolby', translationKey: 'cities.mjolby', stationName: 'Mjölby', uicStationCode: '740000180' },
  { id: 'mora', translationKey: 'cities.mora', stationName: 'Mora', uicStationCode: '740000302' },
  { id: 'motala', translationKey: 'cities.motala', stationName: 'Motala', uicStationCode: '740000172' },
  { id: 'nassjo', translationKey: 'cities.nassjo', stationName: 'Nässjö Central', uicStationCode: '740000140' },
  { id: 'norrkoping', translationKey: 'cities.norrkoping', stationName: 'Norrköping Central', uicStationCode: '740000007' },
  { id: 'nykoping', translationKey: 'cities.nykoping', stationName: 'Nyköping Central', uicStationCode: '740000050' },
  { id: 'sandviken', translationKey: 'cities.sandviken', stationName: 'Sandviken', uicStationCode: '740000195' },
  { id: 'skelleftea', translationKey: 'cities.skelleftea', stationName: 'Skellefteå', uicStationCode: '740000053' },
  { id: 'skovde', translationKey: 'cities.skovde', stationName: 'Skövde Central', uicStationCode: '740000008' },
  { id: 'sodertalje', translationKey: 'cities.sodertalje', stationName: 'Södertälje Central', uicStationCode: '740000055' },
  { id: 'sundsvall', translationKey: 'cities.sundsvall', stationName: 'Sundsvall Central', uicStationCode: '740000130' },
  { id: 'trelleborg', translationKey: 'cities.trelleborg', stationName: 'Trelleborg Central', uicStationCode: '740000088' },
  { id: 'trollhattan', translationKey: 'cities.trollhattan', stationName: 'Trollhättan Central', uicStationCode: '740000191' },
  { id: 'uddevalla', translationKey: 'cities.uddevalla', stationName: 'Uddevalla Central', uicStationCode: '740000119' },
  { id: 'umea', translationKey: 'cities.umea', stationName: 'Umeå Central', uicStationCode: '740000190' },
  { id: 'varberg', translationKey: 'cities.varberg', stationName: 'Varberg', uicStationCode: '740000110' },
  { id: 'vasteras', translationKey: 'cities.vasteras', stationName: 'Västerås Central', uicStationCode: '740000099' },
  { id: 'vaxjo', translationKey: 'cities.vaxjo', stationName: 'Växjö Central', uicStationCode: '740000250' },
  { id: 'angelholm', translationKey: 'cities.angelholm', stationName: 'Ängelholm', uicStationCode: '740000064' },
  { id: 'orebro', translationKey: 'cities.orebro', stationName: 'Örebro Central', uicStationCode: '740000133' },
  { id: 'ostersund', translationKey: 'cities.ostersund', stationName: 'Östersund Central', uicStationCode: '740000123' },
];
