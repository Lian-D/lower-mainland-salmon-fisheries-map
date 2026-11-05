import type { LatLng } from './types';

/**
 * Where each DFO water is on the map.
 *
 * - `match` picks the DFO table row(s) by the "Waters" column.
 * - Each section names the OpenStreetMap waterway(s) to draw and, optionally, where the open stretch starts
 *   (`from`, upstream end) and ends (`to`, downstream end). Leave both out to colour the whole river.
 * - `areaMatch` ties a section to the DFO "Specific area" text; sections without it take every row that no
 *   other section claimed.
 *
 * Boundary coordinates are approximate. Edit them here if a stretch starts or stops in the wrong place.
 */
export interface SectionGeo {
  id: string;
  osm: string[];
  from?: LatLng;
  to?: LatLng;
  areaMatch?: RegExp;
  lake?: boolean;
  /** Keep only the part of the river east (upstream) or west of this longitude. Used for the Fraser at Mission. */
  splitLng?: { lng: number; side: 'east' | 'west' };
}

export interface WaterGeo {
  id: string;
  match: RegExp;
  pin: LatLng;
  sections: SectionGeo[];
}

export const MISSION_CPR_BRIDGE: LatLng = [49.128, -122.296];

const ALOUETTE = ['Alouette River', 'South Alouette River'];
const ALLCO_PARK: LatLng = [49.2455, -122.5135];
const BRIDGE_216: LatLng = [49.2368, -122.6005];

export const WATERS_GEO: WaterGeo[] = [
  {
    id: 'alouette', match: /^alouette/i, pin: [49.237, -122.597],
    sections: [
      { id: 'alouette-upper', osm: ALOUETTE, from: ALLCO_PARK, to: BRIDGE_216, areaMatch: /upstream of the 216/i },
      { id: 'alouette-lower', osm: ALOUETTE, from: BRIDGE_216, areaMatch: /downstream of the 216/i },
      { id: 'alouette-north', osm: ['North Alouette River'], areaMatch: /north alouette/i },
    ],
  },
  { id: 'ashlu', match: /^ashlu/i, pin: [49.925, -123.32], sections: [{ id: 'ashlu', osm: ['Ashlu Creek'] }] },
  {
    id: 'capilano', match: /^capilano/i, pin: [49.335, -123.122],
    sections: [{ id: 'capilano', osm: ['Capilano River'], from: [49.3612, -123.1112] }],
  },
  {
    id: 'chapman', match: /^chapman/i, pin: [49.452, -123.712],
    sections: [{ id: 'chapman', osm: ['Chapman Creek'], from: [49.487, -123.703], to: [49.4497, -123.7148] }],
  },
  { id: 'cheakamus', match: /^cheakamus/i, pin: [49.82, -123.158], sections: [{ id: 'cheakamus', osm: ['Cheakamus River'] }] },
  {
    id: 'chehalis', match: /^chehalis/i, pin: [49.285, -121.93],
    sections: [{ id: 'chehalis', osm: ['Chehalis River'], from: [49.405, -122.02] }],
  },
  {
    id: 'chilliwack', match: /chilliwack|vedder|^sumas/i, pin: [49.099, -121.96],
    sections: [
      { id: 'chilliwack-river', osm: ['Chilliwack River'], from: [49.078, -121.64] },
      { id: 'chilliwack-vedder', osm: ['Vedder River'] },
      { id: 'chilliwack-canal', osm: ['Vedder Canal'] },
      { id: 'chilliwack-sumas', osm: ['Sumas River'], from: [49.131, -122.11] },
    ],
  },
  {
    id: 'coquitlam', match: /^coquitlam/i, pin: [49.262, -122.773],
    sections: [{ id: 'coquitlam', osm: ['Coquitlam River'], from: [49.3555, -122.7763] }],
  },
  {
    id: 'deboville', match: /de ?boville/i, pin: [49.264, -122.718],
    sections: [{ id: 'deboville', osm: ['De Boville Slough', 'DeBoville Slough', 'de Boville Slough'] }],
  },
  {
    id: 'fraser', match: /^fraser/i, pin: [49.16, -122.15],
    sections: [{ id: 'fraser-nontidal', osm: ['Fraser River'], splitLng: { lng: MISSION_CPR_BRIDGE[1], side: 'east' } }],
  },
  { id: 'harrison', match: /^harrison/i, pin: [49.27, -121.86], sections: [{ id: 'harrison', osm: ['Harrison River'] }] },
  {
    id: 'kanaka', match: /^kanaka/i, pin: [49.203, -122.55],
    sections: [{ id: 'kanaka', osm: ['Kanaka Creek'], from: [49.213, -122.525] }],
  },
  { id: 'khartoum', match: /^khartoum/i, pin: [49.84, -124.18], sections: [{ id: 'khartoum', osm: ['Khartoum Lake'], lake: true }] },
  { id: 'lois', match: /^lois/i, pin: [49.82, -124.29], sections: [{ id: 'lois', osm: ['Lois Lake'], lake: true }] },
  {
    id: 'littlecampbell', match: /little campbell/i, pin: [49.018, -122.72],
    sections: [
      { id: 'littlecampbell', osm: ['Little Campbell River'], from: [49.026, -122.705], areaMatch: /12th/i },
      { id: 'littlecampbell-mouth', osm: ['Little Campbell River'], from: [49.0158, -122.7755], to: [49.0122, -122.788], areaMatch: /stayte/i },
    ],
  },
  { id: 'mamquam', match: /^mamquam/i, pin: [49.722, -123.12], sections: [{ id: 'mamquam', osm: ['Mamquam River'] }] },
  {
    id: 'nicomekl', match: /^nicomekl/i, pin: [49.088, -122.70],
    sections: [{ id: 'nicomekl', osm: ['Nicomekl River'], from: [49.0885, -122.6595] }],
  },
  {
    id: 'nicomen', match: /^nicomen|^dewdney/i, pin: [49.175, -122.10],
    sections: [{ id: 'nicomen', osm: ['Nicomen Slough', 'Dewdney Slough'] }],
  },
  { id: 'norrish', match: /^norrish|suicide/i, pin: [49.195, -122.14], sections: [{ id: 'norrish', osm: ['Norrish Creek', 'Suicide Creek'] }] },
  {
    id: 'serpentine', match: /^serpentine/i, pin: [49.115, -122.79],
    sections: [{ id: 'serpentine', osm: ['Serpentine River'], from: [49.124, -122.767] }],
  },
  { id: 'squamish', match: /^squamish/i, pin: [49.775, -123.16], sections: [{ id: 'squamish', osm: ['Squamish River'] }] },
  {
    id: 'stave', match: /^stave/i, pin: [49.175, -122.405],
    sections: [{ id: 'stave', osm: ['Stave River'], from: [49.1935, -122.4085] }],
  },
];

/** OSM names that make up the tidal Fraser (Area 29) */
export const TIDAL_FRASER = /fraser|^canoe pass$/i;
export const BBOX = '48.95,-124.45,50.1,-121.35';
