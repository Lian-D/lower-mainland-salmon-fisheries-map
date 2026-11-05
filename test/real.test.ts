import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRegion2 } from '../src/lib/scrape/region2.ts';
import { parseArea29, subareasWithPortion } from '../src/lib/scrape/area29.ts';
import { pageModified } from '../src/lib/http.ts';
import { fraserScope, restrictionsFor, speciesTidal, statusOf, subScope, tidalStatus } from '../src/lib/rules.ts';

const real = (n: string) => readFileSync(new URL(`./real/${n}`, import.meta.url), 'utf8');

test('live Region 2 table (Oct 16 2026): rowspans, glued notices, chum opening', () => {
  const d = parseRegion2(real('region2-live.html'));
  assert.deepEqual(d.warnings, []);
  assert.equal(d.sourceModified, '2026-10-16');
  assert.equal(new Set(d.entries.map((e) => e.water)).size, 22);
  const chum = d.entries.flatMap((e) => e.rules.filter((r) => r.species === 'Chum').map(() => e.water));
  assert.equal(chum.length, 9); // Alouette x2, Chehalis, Chilliwack, Harrison x2, Nicomen, Serpentine, Stave
  const harrison = d.entries.filter((e) => e.water === 'Harrison River');
  assert.equal(statusOf(harrison, '10-21', 'Chum'), 'open');
  assert.equal(harrison[0].rules[1].notice?.id, 'FN1122');
  const alouette = d.entries.filter((e) => e.water.startsWith('Alouette'));
  assert.deepEqual(alouette[0].rules.map((r) => r.species), ['Chinook', 'Coho', 'Coho', 'Chum']); // rowspan species
  assert.equal(d.entries.filter((e) => e.water.startsWith('Nicomen')).length, 2);
});

test('area text with portions', () => {
  assert.deepEqual(subareasWithPortion('29-6,29-7 and 29-9 to 29-17'), { subs: [6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17], partial: [] });
  assert.deepEqual(subareasWithPortion('Portion of Subarea 29-1 in front of Chapman Creek'), { subs: [], partial: [1] });
  assert.deepEqual(
    subareasWithPortion('(a) Subarea 29-11 and Subareas 29-13 to 29-17; (b) The portion of Subarea 29-9 bounded…; (c) The portion of Subarea 29-12 bounded…'),
    { subs: [11, 13, 14, 15, 16, 17], partial: [9, 12] },
  );
});

test('live Area 29 Salmon tab (updated Oct 20 2026)', () => {
  const html = real('area29-salmon-tab.html');
  assert.equal(pageModified(html), '2026-10-20'); // the tab's date, not the page's 2026-06-04 metadata
  const d = parseArea29(html);
  assert.equal(d.scope, 'salmon-tab');
  assert.equal(d.salmonUpdated, '2026-10-20');
  assert.equal(d.regs!.length, 10);
  assert.equal(d.restrictions!.length, 23);
  assert.ok(d.regs!.every((r) => !/crab|lingcod/i.test(r.areaText)));
  const fr = d.areas!.find((a) => /fraser/i.test(a.name))!;
  assert.deepEqual([fr.subs, fr.partial], [[11, 13, 14, 15, 16, 17], [9, 12]]);

  const day = '10-21';
  assert.equal(tidalStatus(d, fraserScope(), day, 'All'), 'closed');
  assert.equal(tidalStatus(d, subScope(3), day, 'All'), 'open');
  assert.equal(tidalStatus(d, subScope(8), day, 'Chinook'), 'open');
  assert.equal(tidalStatus(d, subScope(6), day, 'All'), 'closed');
  assert.equal(tidalStatus(d, subScope(1), day, 'Sockeye'), 'nr');

  const ch1 = speciesTidal(d, 'Chinook', subScope(1), day);
  assert.deepEqual([ch1.status, ch1.limit, ch1.minSize], ['open', '2', '62cm']);
  const chFr = speciesTidal(d, 'Chinook', fraserScope(), day);
  assert.deepEqual([chFr.status, chFr.minSize], ['closed', '30cm']);
  assert.match(speciesTidal(d, 'Coho', subScope(1), day).limit, /Combined Total/);

  // the dusk-to-dawn finfish closure is not a full closure
  assert.ok(!d.restrictions!.find((r) => /sunset/.test(r.details))!.closes);
  // Chapman Creek coho limit only covers part of 29-1
  const r1 = restrictionsFor(d, subScope(1), day, 'Coho');
  assert.ok(r1.some(({ r, part }) => part && /Chapman/.test(r.areaText) && r.dailyLimit === 2));
  // multi-point hook rule is seasonal (Sep 1 – Mar 31)
  const hooks = (m: string) => restrictionsFor(d, subScope(3), m, 'All').some(({ r }) => /more than one point/.test(r.details));
  assert.ok(hooks('10-21'));
  assert.ok(!hooks('07-01'));
});
