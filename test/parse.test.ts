import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRegion2 } from '../src/lib/scrape/region2.ts';
import { parseArea29 } from '../src/lib/scrape/area29.ts';
import { isActive, statusOf } from '../src/lib/rules.ts';
import { chainWays, clipSection } from '../src/lib/geometry.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('blank-cell and rowspan tables parse identically', () => {
  const a = parseRegion2(fx('region2-blank.html'));
  const b = parseRegion2(fx('region2-rowspan.html'));
  const strip = (d: typeof a) => d.entries;
  assert.deepEqual(strip(a), strip(b));
  assert.equal(a.sourceModified, '2026-09-16');
  assert.deepEqual(a.warnings, []);
});

test('entries, species carry-forward, notices', () => {
  const d = parseRegion2(fx('region2-blank.html'));
  const waters = [...new Set(d.entries.map((e) => e.water))];
  assert.equal(waters.length, 22);
  const alouette = d.entries.filter((e) => e.water.startsWith('Alouette'));
  assert.equal(alouette.length, 3);
  assert.equal(alouette[0].rules[2].species, 'Coho'); // carried forward
  assert.equal(alouette[0].rules[2].kind, 'keep');
  const coq = d.entries.find((e) => e.water === 'Coquitlam River')!;
  assert.equal(coq.rules[0].notice?.id, 'FN0961');
  assert.match(coq.rules[0].notice!.url, /DOC_ID=366093/);
  assert.equal(coq.rules[0].text, '1 hatchery marked per day'); // notice id was glued on
  assert.equal(coq.rules[0].kind, 'keep');
  const cap = d.entries.find((e) => e.water === 'Capilano River')!;
  assert.ok(cap.rules.every((r) => !/FN/.test(r.text)));
  assert.ok(!d.entries.some((e) => /see/i.test(e.water)));
  const fraser = d.entries.find((e) => e.water === 'Fraser River')!;
  assert.deepEqual([fraser.rules[0].kind, fraser.rules[0].to], ['closed', null]);
  assert.equal(d.general.length, 6);
  assert.equal(d.preamble.length, 2);
});

test('date logic wraps the new year', () => {
  assert.ok(isActive({ from: '09-15', to: '01-31' }, '01-10'));
  assert.ok(!isActive({ from: '09-15', to: '01-31' }, '02-10'));
  assert.ok(isActive({ from: '04-01', to: null }, '12-25'));
  const d = parseRegion2(fx('region2-blank.html'));
  const by = (w: string) => d.entries.filter((e) => e.water.startsWith(w));
  assert.equal(statusOf(by('Kanaka'), '10-12', 'All'), 'off');
  assert.equal(statusOf(by('Kanaka'), '11-12', 'All'), 'open');
  assert.equal(statusOf(by('Little Campbell'), '09-20', 'All'), 'banned');
  assert.equal(statusOf(by('Alouette'), '09-10', 'Coho'), 'nr');
  assert.equal(statusOf(by('Fraser'), '10-12', 'Sockeye'), 'banned');
});

test('area 29 salmon section rows are tagged by subarea', () => {
  const d = parseArea29(fx('area29.html'));
  assert.equal(d.status, 'closed'); // tidal Fraser
  assert.equal(d.rows.length, 3); // groundfish table ignored
  assert.deepEqual(d.rows.find((r) => /29-1 to 29-5/.test(r.text))?.subareas, [1, 2, 3, 4, 5]);
  assert.deepEqual(d.rows.find((r) => /Fraser/.test(r.text))?.subareas, [9, 11, 12, 13, 14, 15, 16, 17]);
  assert.equal(d.rows.find((r) => /Fraser/.test(r.text))?.species, 'Coho');
  assert.ok(d.hash.length === 16);
});

test('river chaining joins, orients and clips', () => {
  const w1: [number, number][] = [[49, -122.0], [49, -122.01], [49, -122.02]];
  const w2: [number, number][] = [[49, -122.04], [49, -122.03], [49, -122.02]]; // drawn backwards
  const w3: [number, number][] = [[49, -122.04], [49, -122.05]];
  const chains = chainWays([w2, w1, w3]);
  assert.equal(chains.length, 1);
  assert.deepEqual(chains[0][0], [49, -122.0]); // downstream orientation kept
  const cut = clipSection(chains, { from: [49, -122.011] });
  assert.deepEqual(cut[0][0], [49, -122.01]);
  assert.deepEqual(cut[0].at(-1), [49, -122.05]);
});
