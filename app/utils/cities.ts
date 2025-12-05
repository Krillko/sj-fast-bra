/**
 * Swedish cities sorted by population (top 20)
 * Each city has an ID (slug), translation key, and SJ station name
 */
export interface City {
  id: string;
  translationKey: string;
  stationName: string;
}

export const SWEDISH_CITIES: City[] = [
  { id: 'stockholm', translationKey: 'cities.stockholm', stationName: 'Stockholm Central' },
  { id: 'goteborg', translationKey: 'cities.goteborg', stationName: 'Göteborg Central' },
  { id: 'malmo', translationKey: 'cities.malmo', stationName: 'Malmö Central' },
  { id: 'uppsala', translationKey: 'cities.uppsala', stationName: 'Uppsala Central' },
  { id: 'sollentuna', translationKey: 'cities.sollentuna', stationName: 'Sollentuna' },
  { id: 'vasteras', translationKey: 'cities.vasteras', stationName: 'Västerås Central' },
  { id: 'orebro', translationKey: 'cities.orebro', stationName: 'Örebro Central' },
  { id: 'linkoping', translationKey: 'cities.linkoping', stationName: 'Linköping Central' },
  { id: 'helsingborg', translationKey: 'cities.helsingborg', stationName: 'Helsingborg Central' },
  { id: 'jonkoping', translationKey: 'cities.jonkoping', stationName: 'Jönköping Central' },
  { id: 'norrkoping', translationKey: 'cities.norrkoping', stationName: 'Norrköping Central' },
  { id: 'lund', translationKey: 'cities.lund', stationName: 'Lund Central' },
  { id: 'umea', translationKey: 'cities.umea', stationName: 'Umeå Central' },
  { id: 'gavle', translationKey: 'cities.gavle', stationName: 'Gävle Central' },
  { id: 'boras', translationKey: 'cities.boras', stationName: 'Borås Central' },
  { id: 'eskilstuna', translationKey: 'cities.eskilstuna', stationName: 'Eskilstuna Central' },
  { id: 'sodertalje', translationKey: 'cities.sodertalje', stationName: 'Södertälje Central' },
  { id: 'karlstad', translationKey: 'cities.karlstad', stationName: 'Karlstad Central' },
  { id: 'taby', translationKey: 'cities.taby', stationName: 'Täby' },
  { id: 'vaxjo', translationKey: 'cities.vaxjo', stationName: 'Växjö Central' },
];
