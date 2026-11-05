import * as cheerio from 'cheerio';
import { classify, normalizeSpecies, parseDates } from '../rules';
import type { Entry, Region2Data, Rule, Species } from '../types';
import { clean, tableToGrid } from './table';
import { pageModified } from '../http';
import type { AnyNode } from 'domhandler';

export const REGION2_URL = 'https://www.pac.dfo-mpo.gc.ca/fm-gp/rec/fresh-douce/region2-eng.html';

/** Parse the DFO "Region 2 - Lower Mainland" salmon page. Throws if the page no longer looks like the expected table. */
export function parseRegion2(html: string, url = REGION2_URL): Region2Data {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  const sourceModified = pageModified(html);

  const main = $('main').length ? $('main') : $('body');

  // Pick the table whose header mentions Waters + Species + Dates
  const table = main
    .find('table')
    .toArray()
    .find((t) => {
      const head = clean($(t).find('tr').first().text()).toLowerCase();
      return head.includes('waters') && head.includes('species') && head.includes('date');
    });
  if (!table) throw new Error('Region 2 salmon table not found');

  // General rules: list items that appear before the table (skip nav lists and related links)
  const general: string[] = [];
  const preamble: string[] = [];
  main.find('li, p').each((_, el) => {
    const $el = $(el);
    if ($el.closest('nav, header, footer, .gc-subway, #wb-info, table').length) return;
    // only content before the table
    if (!isBefore(el, table)) return;
    const text = clean($el.clone().children('ul,ol').remove().end().text());
    if (!text || text.length < 25 || text.endsWith(':')) return;
    if ($el.is('li')) {
      if ($el.find('a').length && text.length < 80) return; // related-link items
      general.push(text);
    } else {
      if (/daily limit|no fishing|flowing into/i.test(text)) preamble.push(text);
    }
  });

  // Column lookup by header text
  const grid = tableToGrid($, table, url);
  const headerIdx = grid.findIndex((r) => r.some((c) => /species/i.test(c.text)));
  const header = grid[headerIdx].map((c) => c.text.toLowerCase());
  const col = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const cWater = col(/^waters?/, 0);
  const cArea = col(/specific|area/, 1);
  const cSpecies = col(/species/, 2);
  const cDates = col(/date/, 3);
  const cLimit = col(/limit|gear/, 4);

  const entries: Entry[] = [];
  let water = '';
  let area = '';
  let species: Species | null = null;
  let current: Entry | null = null;

  for (const row of grid.slice(headerIdx + 1)) {
    if (row.every((c) => c.header || !c.text)) continue;
    const w = row[cWater]?.text ?? '';
    const a = row[cArea]?.text ?? '';
    const s = row[cSpecies]?.text ?? '';
    const d = row[cDates]?.text ?? '';
    const limitCell = row[cLimit];
    const l = limitCell?.text ?? '';

    // "Dewdney Slough - See Nicomen Slough" style cross-references
    // These rows span the whole table, so every column holds the same text
    if (/\s[-–—]\s*see\s/i.test(w) || /^see\s/i.test(w)) continue;

    if (w && w !== water) {
      water = w;
      area = a;
      species = null;
    } else if (a && a !== area) {
      area = a;
      species = null;
    }
    if (s) species = normalizeSpecies(s) ?? species;

    if (!current || current.water !== water || current.area !== area) {
      current = { water, area, rules: [] };
      entries.push(current);
    }

    if (!d && !l) continue;
    const dates = parseDates(d);
    if (!dates) {
      warnings.push(`Could not read dates "${d}" for ${water}`);
      continue;
    }
    if (!species) {
      warnings.push(`No species for ${water} (${d})`);
      continue;
    }

    const noticeLink = limitCell?.links.find((x) => /^FN\d+/i.test(x.text));
    const noticeId = noticeLink?.text || l.match(/FN\d{3,5}/i)?.[0];
    // the live page glues the notice link to the limit ("2 per dayFN1122")
    const text = clean(l.replace(/FN\d{3,5}/gi, ''));
    const { kind, known } = classify(text);
    if (!known) warnings.push(`Unrecognised limit "${text}" for ${water}`);

    const rule: Rule = { species, from: dates.from, to: dates.to, kind, text, dates: d };
    if (noticeId) rule.notice = { id: noticeId.toUpperCase(), url: noticeLink?.href ?? 'https://notices.dfo-mpo.gc.ca/fns-sap/index-eng.cfm' };
    current.rules.push(rule);
  }

  const withRules = entries.filter((e) => e.rules.length);
  if (withRules.length < 5) throw new Error(`Only ${withRules.length} waters parsed; page layout may have changed`);

  return {
    source: url,
    fetchedAt: new Date().toISOString(),
    sourceModified,
    general,
    preamble,
    entries: withRules,
    warnings,
  };
}

/** Document order check: is `a` before `b`? */
function isBefore(a: AnyNode, b: AnyNode): boolean {
  const path = (n: any): number[] => {
    const out: number[] = [];
    while (n && n.parent) {
      out.unshift(n.parent.children.indexOf(n));
      n = n.parent;
    }
    return out;
  };
  const pa = path(a);
  const pb = path(b);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] < pb[i];
  return pa.length < pb.length;
}
