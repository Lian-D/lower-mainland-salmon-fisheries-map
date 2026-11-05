export type Species = 'Chinook' | 'Coho' | 'Chum' | 'Pink' | 'Sockeye' | 'All';
export const SPECIES: Exclude<Species, 'All'>[] = ['Chinook', 'Coho', 'Chum', 'Pink', 'Sockeye'];

/** keep = retention allowed, nr = catch & release, gear = gear/method rule only, closed = no fishing for salmon */
export type RuleKind = 'keep' | 'nr' | 'gear' | 'closed';

export interface Rule {
  species: Species;
  /** MM-DD */
  from: string;
  /** MM-DD, or null for "until further notice" */
  to: string | null;
  kind: RuleKind;
  /** Limit/gear text as published by DFO, minus fishery-notice ids */
  text: string;
  /** Raw dates text as published */
  dates: string;
  notice?: { id: string; url: string };
}

export interface Entry {
  water: string;
  area: string;
  rules: Rule[];
}

export interface Region2Data {
  source: string;
  fetchedAt: string;
  /** Last time we looked at the page (it's only re-processed when DFO's date changes) */
  checkedAt?: string;
  sourceModified: string | null;
  /** General bullet rules shown above the table */
  general: string[];
  /** Paragraphs that introduce the table (closures by area etc.) */
  preamble: string[];
  entries: Entry[];
  warnings: string[];
  /** Waters whose rules changed in the most recent fetch that saw a change */
  changes?: { at: string; waters: string[] };
  seed?: boolean;
}

export type Area29Status = 'closed' | 'open' | 'nr' | 'mixed' | 'unknown';

/** open = retention allowed, nr = non-retention (catch & release), closed */
export type TidalKind = 'open' | 'nr' | 'closed';

/** Where a rule applies: whole subareas, parts of subareas, or (null) all of Area 29 / coastwide */
export interface AreaRef {
  areaText: string;
  subs: number[] | null;
  partial: number[];
}

/** A row of the Salmon tab's "Species regulations" table */
export interface Area29Reg extends AreaRef {
  species: Exclude<Species, 'All'>;
  minSize: string;
  gear: string;
  limit: string;
  status: TidalKind;
  statusText: string;
}

/** A row of the Salmon tab's "Restrictions" table */
export interface Area29Restriction extends AreaRef {
  species: Species;
  type: string;
  details: string;
  /** a full closure for that species/area (not the dusk-to-dawn finfish closure) */
  closes: boolean;
  /** "Daily Limit Pieces" / "Minimum Size (cm)" values */
  dailyLimit?: number;
  minSize?: number;
  from?: string;
  to?: string | null;
}

export interface Area29Row {
  context: string;
  text: string;
  kind: 'closed' | 'open' | 'other';
  /** Subarea numbers the rule names (29-11 → 11); null = applies to all of Area 29 */
  subareas?: number[] | null;
  species?: Species;
  /** Season from the rule text, if it states one */
  from?: string;
  to?: string | null;
}

/** One Area 29 subarea polygon (rings as [lat,lng]; first ring outer, rest holes) */
export interface SubareaShape {
  sub: number;
  polygons: LatLng[][][];
  center: LatLng;
}

export interface Area29Data {
  source: string;
  fetchedAt: string;
  checkedAt?: string;
  sourceModified: string | null;
  /** The Salmon tab's own "Last updated" date (the page's metadata date lags behind it) */
  salmonUpdated?: string | null;
  status: Area29Status;
  regs?: Area29Reg[];
  restrictions?: Area29Restriction[];
  /** Named areas from "Area descriptions" (e.g. the tidal Fraser) */
  areas?: (AreaRef & { name: string; description: string })[];
  /** Fallback when the structured tables aren't found */
  rows: Area29Row[];
  hash: string;
  changedAt?: string;
  /** Read from the page's Salmon tab, or (fallback) the whole page */
  scope?: 'salmon-tab' | 'page';
  /** id of the Salmon tab, for a direct link */
  anchor?: string | null;
  seed?: boolean;
}

export type LatLng = [number, number];

/** Section geometry served by /api/rivers */
export interface RiverGeometry {
  ready: boolean;
  riversReady?: boolean;
  subareasReady?: boolean;
  areasReady?: boolean;
  version?: string;
  sections: Record<string, LatLng[][]>;
  /** river outlines cut to the open stretch: polygons of [outer, ...holes] rings */
  shapes: Record<string, LatLng[][][]>;
  lakes: Record<string, LatLng[][]>;
  context: LatLng[][];
  tidal: LatLng[][];
  subareas: SubareaShape[];
  missing: string[];
}

/** What the page hands to the client */
export interface WaterVM {
  id: string;
  name: string;
  pin: LatLng | null;
  entries: Entry[];
  sections: { id: string; entryIdx: number[] }[];
  mapped: boolean;
  changed: boolean;
}

export interface AppData {
  region2: Region2Data;
  area29: Area29Data;
  waters: WaterVM[];
  lastAttempt: { at: string; ok: boolean; error?: string } | null;
}
