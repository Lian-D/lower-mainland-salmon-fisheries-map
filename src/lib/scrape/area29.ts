import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import type { Element } from 'domhandler';
import type { Area29Data, Area29Reg, Area29Restriction, Area29Row, Area29Status, AreaRef, Species, TidalKind } from '../types';
import { FRASER_REF, normalizeSpecies, parseDates, tidalStatus } from '../rules';
import { pageModified } from '../http';
import { clean, tableToGrid } from './table';

export const AREA29_URL = 'https://www.pac.dfo-mpo.gc.ca/fm-gp/rec/tidal-maree/a-s29-eng.html';

/** Subareas that make up the tidal Fraser (CPR bridge at Mission to the mouth): 29-11, 29-13 to 29-17, and parts of 29-9 and 29-12. */
export const TIDAL_FRASER_SUBAREAS = new Set([9, 11, 12, 13, 14, 15, 16, 17]);
const SALMON = /\b(salmon|chinook|coho|chum|pink|sockeye)\b/i;
const OTHER_FISH = /groundfish|lingcod|rockfish|halibut|crab|prawn|shrimp|shellfish|clam|oyster|mussel|scallop|sturgeon|trout|steelhead|herring|sole|flounder|perch|dogfish|shark|skate|octopus|squid|sea cucumber|urchin|smelt|anchov|sardine|tuna/i;

/** Salmon section? The most specific heading wins, so "Salmon › Groundfish" is not salmon. */
function isSalmonContext(parts: string[]): boolean {
  for (let i = parts.length - 1; i >= 0; i--) {
    const h = parts[i];
    if (!h) continue;
    if (SALMON.test(h)) return true;
    if (OTHER_FISH.test(h)) return false;
  }
  return false;
}

/**
 * Subareas named in a piece of text. Handles "29-6, 29-7, and 29-9 to 29-17", "29-9 to 17", "Subarea 29-11".
 * Returns null when the text names no subarea (so it may apply to all of Area 29).
 */
export function subareasIn(text: string): Set<number> | null {
  const out = new Set<number>();
  const t = text.replace(/[–—]/g, '-');
  const range = /\b29-(\d{1,2})\s*(?:to|through|-)\s*(?:29-)?(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  const covered: [number, number][] = [];
  while ((m = range.exec(t))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b >= a && b - a < 40) for (let i = a; i <= b; i++) out.add(i);
    covered.push([m.index, m.index + m[0].length]);
  }
  const single = /\b29-(\d{1,2})\b/g;
  while ((m = single.exec(t))) {
    if (covered.some(([s, e]) => m!.index >= s && m!.index < e)) continue;
    out.add(Number(m[1]));
  }
  return out.size ? out : null;
}

const touchesTidalFraser = (text: string) => {
  const subs = subareasIn(text);
  if (subs === null) return null; // names no subarea
  return [...subs].some((s) => TIDAL_FRASER_SUBAREAS.has(s));
};

/**
 * Area 29 is long and irregular. We walk the page in order, keep track of the heading we're under, and
 * collect salmon rules (table rows, list items, paragraphs) that apply to the tidal Fraser — either by naming
 * one of its subareas or the Fraser River, or by applying to all of Area 29.
 */
/**
 * The Area 29 page has one tab per fishery. Find the "Salmon" tab so everything else (crab, prawns,
 * groundfish…) is ignored. Handles WET tabs (<details><summary>Salmon</summary>), tab lists pointing at a
 * panel id, and a plain "Salmon" heading followed by its section.
 */
export function findSalmonPanel($: cheerio.CheerioAPI): { el: cheerio.Cheerio<Element>; anchor: string | null } | null {
  const isSalmonLabel = (t: string) => /^\s*(pacific\s+)?salmon\b/i.test(clean(t));

  const details = $('details')
    .filter((_, d) => isSalmonLabel($(d).children('summary').first().text()))
    .first();
  if (details.length) return { el: details as cheerio.Cheerio<Element>, anchor: details.attr('id') ?? null };

  const tab = $('[role="tab"], [role="tablist"] a, .wb-tabs a[href^="#"], .tabs a[href^="#"]')
    .filter((_, a) => isSalmonLabel($(a).text()))
    .first();
  if (tab.length) {
    const id = (tab.attr('aria-controls') || (tab.attr('href') ?? '').replace(/^#/, '')).trim();
    const panel = id ? $(`[id="${id.replace(/"/g, '')}"]`) : null;
    if (panel && panel.length) return { el: panel.first() as cheerio.Cheerio<Element>, anchor: id };
  }

  const heading = $('h2, h3').filter((_, h) => isSalmonLabel($(h).text()) && clean($(h).text()).length < 40).first();
  if (heading.length) {
    const tag = (heading[0] as Element).tagName;
    const section = $('<div></div>');
    section.append(heading.nextUntil(tag).clone());
    return { el: section as cheerio.Cheerio<Element>, anchor: heading.attr('id') ?? heading.closest('[id]').attr('id') ?? null };
  }
  return null;
}

export function parseArea29(html: string, url = AREA29_URL): Area29Data {
  const $ = cheerio.load(html);
  const sourceModified = pageModified(html);
  $('nav, header, footer, #wb-info, .gc-subway, script, style').remove();
  const panel = findSalmonPanel($);
  if (panel) {
    const structured = parseSalmonTables($, panel.el, url);
    if (structured) {
      return { source: url, fetchedAt: new Date().toISOString(), sourceModified, scope: 'salmon-tab', anchor: panel.anchor, ...structured };
    }
  }
  const main = panel ? panel.el : $('main').length ? $('main') : $('body');
  const base = panel ? ['Salmon'] : []; // inside the Salmon tab everything is salmon unless a heading says otherwise

  const rows: Area29Row[] = [];
  const seen = new Set<string>();
  const headings: string[] = []; // h2..h5 stack
  const push = (context: string, text: string) => {
    const key = `${context}|${text}`;
    if (seen.has(key) || text.length < 3) return;
    seen.add(key);
    const named = subareasIn(text);
    // "Fraser River tidal waters" without subarea numbers → the tidal Fraser subareas
    const subs = named ? [...named].sort((a, b) => a - b) : /fraser/i.test(text) ? [...TIDAL_FRASER_SUBAREAS] : null;
    const dates = parseDates(text);
    rows.push({
      context,
      text,
      kind: classifyTidal(text),
      subareas: subs,
      species: speciesOf(context, text),
      ...(dates ? { from: dates.from, to: dates.to } : {}),
    });
  };
  // Inside the Salmon tab keep every salmon rule (each is tagged with its subareas); on the whole-page
  // fallback keep only rules that touch the tidal Fraser, to limit noise.
  const keepAll = !!panel;

  main.find('h2, h3, h4, h5, table, li, p, dd').each((_, el) => {
    const node = el as Element;
    const tag = node.tagName.toLowerCase();
    if (/^h[2-5]$/.test(tag)) {
      const level = Number(tag[1]) - 2;
      headings.length = level;
      headings[level] = clean($(node).text());
      return;
    }
    const context = headings.filter(Boolean).join(' › ');
    const inSalmonSection = isSalmonContext([...base, ...headings]);

    if (tag === 'table') {
      const caption = clean($(node).find('caption').first().text());
      const ctx = [context, caption].filter(Boolean).join(' › ');
      const grid = tableToGrid($, node, url);
      const header = grid[0]?.map((c) => c.text).join(' | ') ?? '';
      const salmonTable = isSalmonContext([...base, ...headings, caption]) || (SALMON.test(header) && !OTHER_FISH.test(caption));
      for (const row of grid.slice(1)) {
        if (row.every((c) => c.header && !c.text)) continue;
        const text = [...new Set(row.map((c) => c.text).filter(Boolean))].join(' | ');
        if (!text || !(salmonTable || (SALMON.test(text) && !OTHER_FISH.test(text)))) continue;
        const tf = touchesTidalFraser(text);
        if (!keepAll && tf === false && !/fraser/i.test(text)) continue;
        push(ctx, text);
      }
      return;
    }

    // list items / paragraphs: skip ones inside tables (handled above) or nested lists' parents
    if ($(node).closest('table').length) return;
    const text = clean($(node).clone().children('ul,ol').remove().end().text());
    if (!text || text.length > 600) return;
    if (!(inSalmonSection || SALMON.test(text))) return;
    const tf = touchesTidalFraser(text);
    const fraser = /fraser/i.test(text);
    // need a rule-ish statement that names our subareas / the Fraser, or an area-wide salmon rule
    const ruleish = /closed|open|daily limit|non[- ]?retention|no fishing|per day|\b0\b/i.test(text);
    if (!ruleish) return;
    if (keepAll ? inSalmonSection || tf !== null || fraser : tf === true || fraser || (tf === null && inSalmonSection)) push(context, text);
  });

  const scope = { scope: panel ? ('salmon-tab' as const) : ('page' as const), anchor: panel?.anchor ?? null };
  if (!rows.length) {
    return { source: url, fetchedAt: new Date().toISOString(), sourceModified, status: 'unknown', rows, hash: '', ...scope };
  }
  const hash = createHash('sha256').update(rows.map((r) => r.text).join('\n')).digest('hex').slice(0, 16);
  return { source: url, fetchedAt: new Date().toISOString(), sourceModified, status: overall(rows.filter(touchesFraserRow)), rows, hash, ...scope };
}

const touchesFraserRow = (r: Area29Row) => !r.subareas || r.subareas.some((s) => TIDAL_FRASER_SUBAREAS.has(s));

/** Species from the most specific heading, else from the rule text */
function speciesOf(context: string, text: string): Species {
  const parts = context.split(' › ').reverse();
  for (const p of [...parts, text]) {
    const found = (['Chinook', 'Coho', 'Chum', 'Pink', 'Sockeye'] as const).filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(p));
    if (found.length === 1) return found[0];
    if (found.length > 1) return 'All';
  }
  return 'All';
}

export function classifyTidal(text: string): Area29Row['kind'] {
  const t = text.toLowerCase();
  const openSignal =
    (/\b(?:open|opened|opening|opens)\b/.test(t) && !/\bnot open\b/.test(t)) ||
    /\b[1-9]\d?\s*(?:per day|daily)\b/.test(t) ||
    /daily limit(?: of| is)?\s*[1-9]/.test(t) ||
    /\|\s*[1-9]\s*(?:\||$)/.test(t);
  const closedSignal = /\bclosed\b|non[- ]?retention|no fishing|daily limit(?: of| is)?\s*(?:0|zero)\b|\|\s*0\s*(?:\||$)|\bzero\b/.test(t);
  if (closedSignal && !openSignal) return 'closed';
  if (openSignal && !closedSignal) return 'open';
  return 'other';
}

function overall(rows: Area29Row[]): Area29Status {
  const kinds = new Set(rows.map((r) => r.kind));
  if (kinds.has('open') && kinds.has('closed')) return 'mixed';
  if (kinds.has('open')) return 'open';
  if (kinds.has('closed')) return 'closed';
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Structured reading of the Salmon tab (the layout DFO uses today)    */
/* ------------------------------------------------------------------ */

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Subareas named in an area text, split into whole subareas and "portion of Subarea …" ones. */
export function subareasWithPortion(text: string): { subs: number[]; partial: number[] } | null {
  const full = new Set<number>();
  const partial = new Set<number>();
  const t = text.replace(/[–—]/g, '-');
  const re = /(portion of\s+)?(?:sub-?areas?\s+)?\b29-(\d{1,2})\b(?:\s*(?:to|through)\s*(?:29-)?(\d{1,2})\b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const a = Number(m[2]);
    const b = m[3] ? Number(m[3]) : a;
    for (let i = a; i <= Math.min(b, a + 40); i++) (m[1] ? partial : full).add(i);
  }
  if (!full.size && !partial.size) return null;
  return { subs: [...full].sort((x, y) => x - y), partial: [...partial].filter((x) => !full.has(x)).sort((x, y) => x - y) };
}

function tidalKind(status: string): TidalKind | null {
  if (/non[- ]?retention/i.test(status)) return 'nr';
  if (/\bopen/i.test(status)) return 'open';
  if (/closed/i.test(status)) return 'closed';
  return null;
}

/** Read the Species regulations, Restrictions and Area descriptions tables. Returns null if the first is missing. */
export function parseSalmonTables($: cheerio.CheerioAPI, panel: cheerio.Cheerio<Element>, url: string) {
  const tables = panel.find('table').toArray().map((t) => {
    const grid = tableToGrid($, t, url);
    return { grid, head: (grid[0] ?? []).map((c) => c.text.toLowerCase()) };
  });
  const col = (head: string[], re: RegExp) => head.findIndex((h) => re.test(h));
  const regsT = tables.find((t) => col(t.head, /species/) >= 0 && col(t.head, /^areas?$/) >= 0 && col(t.head, /status/) >= 0);
  if (!regsT) return null;
  const restT = tables.find((t) => col(t.head, /restriction type/) >= 0);
  const areaT = tables.find((t) => col(t.head, /area description/) >= 0);

  // named areas, e.g. "Tidal portion of the Fraser River (in Area 29)" → 29-11, 29-13…17 + parts of 29-9 and 29-12
  const areas: NonNullable<Area29Data['areas']> = [];
  if (areaT) {
    const cn = col(areaT.head, /^area$/), cd = col(areaT.head, /description/);
    for (const r of areaT.grid.slice(1)) {
      const name = r[cn]?.text ?? '';
      if (!name) continue;
      const description = r[cd]?.text ?? '';
      const found = /coastwide/i.test(name) ? null : subareasWithPortion(`${name} ${description}`);
      areas.push({ name, description, areaText: name, subs: found ? found.subs : null, partial: found?.partial ?? [] });
    }
  }
  const ref = (text: string): AreaRef => {
    const t = text.trim();
    if (!t || /coastwide/i.test(t) || /^(area\s*)?29$/i.test(t)) return { areaText: t || 'Area 29', subs: null, partial: [] };
    const named = areas.find((a) => normName(a.name) === normName(t));
    if (named) return { areaText: t, subs: named.subs, partial: named.partial };
    const found = subareasWithPortion(t);
    if (found) return { areaText: t, ...found };
    if (/fraser/i.test(t)) return { areaText: t, subs: [...FRASER_REF.subs], partial: [...FRASER_REF.partial] };
    return { areaText: t, subs: null, partial: [] };
  };

  const regs: Area29Reg[] = [];
  {
    const h = regsT.head;
    const [cs, ca, cm, cg, cl, cst] = [col(h, /species/), col(h, /^areas?$/), col(h, /min/), col(h, /gear/), col(h, /limit/), col(h, /status/)];
    let species: Species | null = null;
    for (const r of regsT.grid.slice(1)) {
      if (r[cs]?.text) species = normalizeSpecies(r[cs].text) ?? species;
      const status = tidalKind(r[cst]?.text ?? '');
      if (!species || species === 'All' || !status || !r[ca]?.text) continue;
      regs.push({
        species, ...ref(r[ca].text),
        minSize: r[cm]?.text ?? '', gear: r[cg]?.text ?? '', limit: r[cl]?.text ?? '',
        status, statusText: r[cst].text,
      });
    }
  }

  const restrictions: Area29Restriction[] = [];
  if (restT) {
    const h = restT.head;
    const [cs, ca, ct, cd] = [col(h, /species/), col(h, /^areas?$/), col(h, /type/), col(h, /details/)];
    let species: Species = 'All';
    for (const r of restT.grid.slice(1)) {
      const sp = r[cs]?.text;
      if (sp) species = normalizeSpecies(sp) ?? 'All'; // "Finfish" / "Salmon" → all salmon
      const type = r[ct]?.text ?? '';
      const details = r[cd]?.text ?? '';
      if (!type && !details) continue;
      const dates = parseDates(details);
      const num = details.match(/^\s*(\d+)\b/);
      restrictions.push({
        species, ...ref(r[ca]?.text ?? ''), type, details,
        closes: /^closed$/i.test(type.trim()) && !/sunset|sunrise/i.test(details),
        ...(/daily limit/i.test(type) && num && species !== 'All' ? { dailyLimit: Number(num[1]) } : {}),
        ...(/minimum size/i.test(type) && num ? { minSize: Number(num[1]) } : {}),
        ...(dates ? { from: dates.from, to: dates.to } : {}),
      });
    }
  }

  const dates = clean(panel.text()).match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/g) ?? [];
  const salmonUpdated = dates.map((d) => d.slice(-10)).sort().pop() ?? null;
  const partial = { regs, restrictions, areas, rows: [] as Area29Row[] };
  const fraserArea = areas.find((a) => /fraser/i.test(a.name));
  const status = tidalOverall(partial, fraserArea ?? { ...FRASER_REF, areaText: 'Tidal Fraser' });
  const hash = createHash('sha256').update(JSON.stringify([regs, restrictions])).digest('hex').slice(0, 16);
  return { ...partial, salmonUpdated, status, hash };
}

/** Today's status for the tidal Fraser across all salmon (used in logs and the deploy summary). */
function tidalOverall(d: Pick<Area29Data, 'regs' | 'restrictions' | 'rows'>, fr: AreaRef): Area29Status {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date()).slice(5);
  const scope = { subs: [...(fr.subs ?? []), ...fr.partial], partialOk: true };
  const st = tidalStatus(d as Area29Data, scope, today, 'All');
  return st;
}
