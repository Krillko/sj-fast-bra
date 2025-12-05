/**
 * Swedish train stations (50 stations)
 * Top 4 cities are prioritized, rest sorted alphabetically
 * Each city has an ID (slug), translation key, and SJ station name
 */
export interface City {
  id: string;
  translationKey: string;
  stationName: string;
}

export const SWEDISH_CITIES: City[] = [
  // Top 4 prioritized cities
  { id: 'stockholm', translationKey: 'cities.stockholm', stationName: 'Stockholm Central' },
  { id: 'goteborg', translationKey: 'cities.goteborg', stationName: 'Göteborg Central' },
  { id: 'malmo', translationKey: 'cities.malmo', stationName: 'Malmö Central' },
  { id: 'uppsala', translationKey: 'cities.uppsala', stationName: 'Uppsala Central' },

  // Rest sorted alphabetically (Swedish order: å, ä, ö at the end)
  { id: 'alvesta', translationKey: 'cities.alvesta', stationName: 'Alvesta' },
  { id: 'avesta', translationKey: 'cities.avesta', stationName: 'Avesta Krylbo' },
  { id: 'boras', translationKey: 'cities.boras', stationName: 'Borås Central' },
  { id: 'borlange', translationKey: 'cities.borlange', stationName: 'Borlänge Central' },
  { id: 'eskilstuna', translationKey: 'cities.eskilstuna', stationName: 'Eskilstuna Central' },
  { id: 'falkenberg', translationKey: 'cities.falkenberg', stationName: 'Falkenberg' },
  { id: 'falun', translationKey: 'cities.falun', stationName: 'Falun Central' },
  { id: 'flen', translationKey: 'cities.flen', stationName: 'Flen' },
  { id: 'gavle', translationKey: 'cities.gavle', stationName: 'Gävle Central' },
  { id: 'halmstad', translationKey: 'cities.halmstad', stationName: 'Halmstad Central' },
  { id: 'hallsberg', translationKey: 'cities.hallsberg', stationName: 'Hallsberg' },
  { id: 'hassleholm', translationKey: 'cities.hassleholm', stationName: 'Hässleholm Central' },
  { id: 'helsingborg', translationKey: 'cities.helsingborg', stationName: 'Helsingborg Central' },
  { id: 'hudiksvall', translationKey: 'cities.hudiksvall', stationName: 'Hudiksvall' },
  { id: 'jonkoping', translationKey: 'cities.jonkoping', stationName: 'Jönköping Central' },
  { id: 'kalmar', translationKey: 'cities.kalmar', stationName: 'Kalmar Central' },
  { id: 'karlskrona', translationKey: 'cities.karlskrona', stationName: 'Karlskrona Central' },
  { id: 'karlstad', translationKey: 'cities.karlstad', stationName: 'Karlstad Central' },
  { id: 'katrineholm', translationKey: 'cities.katrineholm', stationName: 'Katrineholm Central' },
  { id: 'kiruna', translationKey: 'cities.kiruna', stationName: 'Kiruna' },
  { id: 'kristianstad', translationKey: 'cities.kristianstad', stationName: 'Kristianstad Central' },
  { id: 'kumla', translationKey: 'cities.kumla', stationName: 'Kumla' },
  { id: 'landskrona', translationKey: 'cities.landskrona', stationName: 'Landskrona' },
  { id: 'lidkoping', translationKey: 'cities.lidkoping', stationName: 'Lidköping' },
  { id: 'linkoping', translationKey: 'cities.linkoping', stationName: 'Linköping Central' },
  { id: 'ludvika', translationKey: 'cities.ludvika', stationName: 'Ludvika' },
  { id: 'lund', translationKey: 'cities.lund', stationName: 'Lund Central' },
  { id: 'mjolby', translationKey: 'cities.mjolby', stationName: 'Mjölby' },
  { id: 'mora', translationKey: 'cities.mora', stationName: 'Mora' },
  { id: 'motala', translationKey: 'cities.motala', stationName: 'Motala' },
  { id: 'nassjo', translationKey: 'cities.nassjo', stationName: 'Nässjö Central' },
  { id: 'norrkoping', translationKey: 'cities.norrkoping', stationName: 'Norrköping Central' },
  { id: 'nykoping', translationKey: 'cities.nykoping', stationName: 'Nyköping Central' },
  { id: 'sandviken', translationKey: 'cities.sandviken', stationName: 'Sandviken' },
  { id: 'skelleftea', translationKey: 'cities.skelleftea', stationName: 'Skellefteå' },
  { id: 'skovde', translationKey: 'cities.skovde', stationName: 'Skövde Central' },
  { id: 'sodertalje', translationKey: 'cities.sodertalje', stationName: 'Södertälje Central' },
  { id: 'sundsvall', translationKey: 'cities.sundsvall', stationName: 'Sundsvall Central' },
  { id: 'trelleborg', translationKey: 'cities.trelleborg', stationName: 'Trelleborg Central' },
  { id: 'trollhattan', translationKey: 'cities.trollhattan', stationName: 'Trollhättan Central' },
  { id: 'uddevalla', translationKey: 'cities.uddevalla', stationName: 'Uddevalla Central' },
  { id: 'umea', translationKey: 'cities.umea', stationName: 'Umeå Central' },
  { id: 'varberg', translationKey: 'cities.varberg', stationName: 'Varberg' },
  { id: 'vasteras', translationKey: 'cities.vasteras', stationName: 'Västerås Central' },
  { id: 'vaxjo', translationKey: 'cities.vaxjo', stationName: 'Växjö Central' },
  { id: 'angelholm', translationKey: 'cities.angelholm', stationName: 'Ängelholm' },
  { id: 'orebro', translationKey: 'cities.orebro', stationName: 'Örebro Central' },
  { id: 'ostersund', translationKey: 'cities.ostersund', stationName: 'Östersund Central' },
];
