import type { Area29Data, Area29Restriction, Area29Row, AreaRef, Entry, Rule, RuleKind, Species, TidalKind } from './types';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

function monthDay(m: string, d: string): string | null {
  const mm = MONTHS[m.toLowerCase().replace('.', '')];
  const dd = Number(d);
  if (!mm || !dd || dd > 31) return null;
  return `${pad(mm)}-${pad(dd)}`;
}

/** Parse "Sep 1 to Nov 30", "June 1 to Aug 31", "Apr 1 until further notice". */
export function parseDates(text: string): { from: string; to: string | null } | null {
  const t = text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const range = t.match(/([A-Za-z.]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|through|until|–|—|-)\s*([A-Za-z.]+)\s+(\d{1,2})/i);
  if (range) {
    const from = monthDay(range[1], range[2]);
    const to = monthDay(range[3], range[4]);
    if (from && to) return { from, to };
  }
  const open = t.match(/([A-Za-z.]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:until|till|to)\s+further\s+notice/i);
  if (open) {
    const from = monthDay(open[1], open[2]);
    if (from) return { from, to: null };
  }
  return null;
}

const NUMBER_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** Decide what a limit/gear cell means. */
export function classify(text: string): { kind: RuleKind; known: boolean } {
  const t = text.toLowerCase();
  if (/no fishing/.test(t) || /\bclosed\b/.test(t)) return { kind: 'closed', known: true };
  if (/non[- ]?retention|catch[- ]and[- ]release|release all/.test(t)) return { kind: 'nr', known: true };
  const perDay = t.match(/\b(\d+|zero|one|two|three|four|five|six)\b[^.]*?\bper day\b/) || t.match(/daily limit[^0-9a-z]*(\d+|zero|one|two|three|four)/);
  if (perDay) {
    const n = /^\d+$/.test(perDay[1]) ? Number(perDay[1]) : NUMBER_WORDS[perDay[1]];
    return { kind: n === 0 ? 'nr' : 'keep', known: true };
  }
  if (/bait ban|barbless|single hook|hook|fly fishing only|artificial fly|gear/.test(t)) return { kind: 'gear', known: true };
  return { kind: 'gear', known: false };
}

export function normalizeSpecies(text: string): Species | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith('all')) return 'All';
  if (t.includes('chinook')) return 'Chinook';
  if (t.includes('coho')) return 'Coho';
  if (t.includes('chum')) return 'Chum';
  if (t.includes('pink')) return 'Pink';
  if (t.includes('sockeye')) return 'Sockeye';
  return null;
}

/* ---------------- date logic (client and server) ---------------- */

const md = (s: string) => {
  const [m, d] = s.split('-').map(Number);
  return m * 100 + d;
};

/** Is the rule active on the given MM-DD? Rules follow the Apr 1 – Mar 31 licence year and may wrap the new year. */
export function isActive(rule: Pick<Rule, 'from' | 'to'>, mmdd: string): boolean {
  const d = md(mmdd);
  const a = md(rule.from);
  // "until further notice" runs through the end of the licence year (Mar 31)
  const b = rule.to === null ? 331 : md(rule.to);
  return a <= b ? d >= a && d <= b : d >= a || d <= b;
}

export type SpeciesFilter = Species; // 'All' = any species

export function ruleApplies(rule: Rule, mmdd: string, filter: SpeciesFilter): boolean {
  if (!isActive(rule, mmdd)) return false;
  if (filter === 'All' || rule.species === 'All') return true;
  return rule.species === filter;
}

/** Map status: open (keep), nr (catch & release), off (listed but nothing open now), banned (a "no fishing" rule is in force). */
export type Status = 'open' | 'nr' | 'off' | 'banned';

export function statusOf(entries: Entry[], mmdd: string, filter: SpeciesFilter): Status {
  const rules = entries.flatMap((e) => e.rules).filter((r) => ruleApplies(r, mmdd, filter));
  if (rules.some((r) => r.kind === 'closed')) return 'banned';
  if (rules.some((r) => r.kind === 'keep')) return 'open';
  if (rules.some((r) => r.kind === 'nr')) return 'nr';
  return 'off';
}

/** Next date (MM-DD) after `mmdd` on which retention opens, for "opens Nov 1" hints. */
export function nextOpening(entries: Entry[], mmdd: string, filter: SpeciesFilter): string | null {
  const starts = entries
    .flatMap((e) => e.rules)
    .filter((r) => r.kind === 'keep' && (filter === 'All' || r.species === filter || r.species === 'All'))
    .map((r) => r.from);
  if (!starts.length) return null;
  // order by days after today, wrapping at the licence year
  const toDays = (s: string) => {
    const [m, d] = s.split('-').map(Number);
    const base = Date.UTC(2001, m - 1, d);
    return (base - Date.UTC(2001, 3, 1) + 365 * 864e5) % (365 * 864e5);
  };
  const now = toDays(mmdd);
  const sorted = starts
    .map((s) => ({ s, delta: (toDays(s) - now + 365 * 864e5) % (365 * 864e5) }))
    .filter((x) => x.delta > 0)
    .sort((a, b) => a.delta - b.delta);
  return sorted[0]?.s ?? null;
}

/* ---------------- Area 29 (tidal) ---------------- */

export type TidalStatus = TidalKind | 'unknown';
/** Tidal Fraser per DFO's area description: 29-11 and 29-13 to 29-17, plus parts of 29-9 and 29-12 */
export const FRASER_REF = { subs: [11, 13, 14, 15, 16, 17], partial: [9, 12] };
export const TIDAL_FRASER_SUBS = [9, 11, 12, 13, 14, 15, 16, 17];

/** The place being asked about: some subareas; partialOk = also count rules for parts of them */
export interface TidalScope { subs: number[]; partialOk: boolean }
export const subScope = (n: number): TidalScope => ({ subs: [n], partialOk: false });
export const fraserScope = (): TidalScope => ({ subs: TIDAL_FRASER_SUBS, partialOk: true });

const SALMON_SPECIES = ['Chinook', 'Coho', 'Chum', 'Pink', 'Sockeye'] as const;
const RANK: Record<TidalKind, number> = { open: 3, nr: 2, closed: 1 };

export function covers(ref: AreaRef, scope: TidalScope): boolean {
  if (ref.subs === null) return true;
  return scope.subs.some((s) => ref.subs!.includes(s) || (scope.partialOk && ref.partial.includes(s)));
}

const restrictionActive = (r: Area29Restriction, mmdd: string) => !r.from || isActive({ from: r.from, to: r.to ?? null }, mmdd);

export interface SpeciesTidal {
  species: (typeof SALMON_SPECIES)[number];
  status: TidalStatus;
  limit: string;
  minSize: string;
  gear: string;
  closedBy?: Area29Restriction;
}

/** One species in one place on one date, from the Species regulations table plus Restrictions. */
export function speciesTidal(d: Area29Data, sp: SpeciesTidal['species'], scope: TidalScope, mmdd: string): SpeciesTidal {
  const regs = (d.regs ?? []).filter((r) => r.species === sp && covers(r, scope));
  if (!regs.length) return { species: sp, status: 'unknown', limit: '', minSize: '', gear: '' };
  const best = regs.reduce((a, b) => (RANK[b.status] > RANK[a.status] ? b : a));
  const out: SpeciesTidal = { species: sp, status: best.status, limit: best.limit, minSize: best.minSize, gear: best.gear };
  for (const r of d.restrictions ?? []) {
    if (r.species !== sp && r.species !== 'All') continue;
    if (!covers(r, scope) || !restrictionActive(r, mmdd)) continue;
    if (r.closes) { out.status = 'closed'; out.closedBy = r; }
    if (r.dailyLimit !== undefined && r.species === sp) {
      if (r.dailyLimit === 0) out.status = 'closed';
      else if (out.status !== 'closed') out.limit = String(r.dailyLimit);
    }
    if (r.minSize !== undefined && r.species === sp) out.minSize = `${r.minSize}cm`;
  }
  if (out.status === 'closed') out.limit = '0';
  return out;
}

/** Status for a place: any species open → open, else any non-retention → nr, else closed. */
export function tidalStatus(d: Area29Data, scope: TidalScope, mmdd: string, filter: Species): TidalStatus {
  if (!d.regs?.length) return tidalStatusRows(d.rows ?? [], scope.subs, mmdd, filter);
  const list = (filter === 'All' ? SALMON_SPECIES : SALMON_SPECIES.filter((s) => s === filter)).map((sp) => speciesTidal(d, sp, scope, mmdd).status);
  if (list.includes('open')) return 'open';
  if (list.includes('nr')) return 'nr';
  if (list.includes('closed')) return 'closed';
  return 'unknown';
}

export function speciesTable(d: Area29Data, scope: TidalScope, mmdd: string, filter: Species): SpeciesTidal[] {
  return SALMON_SPECIES.filter((s) => filter === 'All' || s === filter).map((sp) => speciesTidal(d, sp, scope, mmdd));
}

/** Restrictions that apply to a place on a date, plus ones for only part of it (flagged). */
export function restrictionsFor(d: Area29Data, scope: TidalScope, mmdd: string, filter: Species): { r: Area29Restriction; part: boolean }[] {
  return (d.restrictions ?? [])
    .filter((r) => (filter === 'All' || r.species === 'All' || r.species === filter) && restrictionActive(r, mmdd))
    .flatMap((r): { r: Area29Restriction; part: boolean }[] => {
      if (covers(r, scope)) return [{ r, part: false }];
      if (r.subs !== null && scope.subs.some((s) => r.partial.includes(s))) return [{ r, part: true }];
      return [];
    });
}

/* fallback for when the structured tables can't be found: heuristic rows */
function tidalStatusRows(rows: Area29Row[], subs: number[], mmdd: string, filter: Species): TidalStatus {
  const rel = rowsFor(rows, subs, filter).filter((r) => !r.from || isActive({ from: r.from, to: r.to ?? null }, mmdd));
  if (rel.some((r) => r.kind === 'open')) return 'open';
  if (rel.some((r) => r.kind === 'closed')) return 'closed';
  return 'unknown';
}

export function rowsFor(rows: Area29Row[], subs: number[], filter: Species): Area29Row[] {
  return rows.filter((r) => (!r.subareas || r.subareas.some((s) => subs.includes(s))) && (filter === 'All' || !r.species || r.species === 'All' || r.species === filter));
}
