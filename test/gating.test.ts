import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsReparse, pageModified } from '../src/lib/http.ts';
import { parseArea29, subareasIn } from '../src/lib/scrape/area29.ts';
import { fraserScope, subScope, tidalStatus } from '../src/lib/rules.ts';
import { processSubareas, subareaOf } from '../src/lib/subareas.ts';

test('re-process only when DFO date changes', () => {
  const prev = { sourceModified: '2026-09-16' };
  assert.equal(needsReparse(prev, '2026-09-16', false), false);
  assert.equal(needsReparse(prev, '2026-10-20', false), true);
  assert.equal(needsReparse(prev, '2026-09-16', true), true); // forced
  assert.equal(needsReparse({ sourceModified: '2026-09-16', seed: true }, '2026-09-16', false), true); // never parsed live
  assert.equal(needsReparse(null, '2026-09-16', false), true);
  assert.equal(needsReparse(prev, null, false), true); // can't read the date
});

test('page date from meta or footer', () => {
  assert.equal(pageModified('<meta name="dcterms.modified" content="2026-10-20">'), '2026-10-20');
  assert.equal(pageModified('<meta content="2026-10-20" name="dcterms.modified">'), '2026-10-20');
  assert.equal(pageModified('<dl><dt>Date modified:</dt><dd><time>2026-10-01</time></dd></dl>'), '2026-10-01');
});

test('subarea ranges expand', () => {
  assert.deepEqual([...subareasIn('Subareas 29-6, 29-7, and 29-9 to 29-17')!].sort((a, b) => a - b), [6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual([...subareasIn('29-1 to 5')!], [1, 2, 3, 4, 5]);
  assert.equal(subareasIn('All of Area 29'), null);
});

test('area 29 written as headings + lists', () => {
  const html = `<main><h2>Salmon</h2><h3>Coho</h3><ul>
    <li>Subareas 29-1 to 29-5: daily limit of 2 hatchery marked coho.</li>
    <li>Subareas 29-9 to 29-17: closed to coho, daily limit 0.</li></ul>
    <h3>Chinook</h3><p>Fraser River tidal waters: no fishing for chinook until further notice.</p>
    <h2>Crab</h2><p>Subarea 29-11 closed to crab.</p></main>`;
  const d = parseArea29(html);
  assert.equal(d.rows.length, 3); // crab section left out
  assert.equal(d.status, 'closed');
  assert.equal(tidalStatus(d, fraserScope(), '10-21', 'All'), 'closed');
  assert.equal(tidalStatus(d, subScope(3), '10-21', 'Coho'), 'open');
  assert.equal(tidalStatus(d, subScope(3), '10-21', 'Chinook'), 'unknown');
  const open = parseArea29(html.replace('closed to coho, daily limit 0', 'daily limit of 2 coho, opens Oct 1'));
  assert.equal(open.status, 'mixed');
  assert.equal(tidalStatus(open, fraserScope(), '10-21', 'Coho'), 'open');
  assert.equal(tidalStatus(open, fraserScope(), '10-21', 'Chinook'), 'closed');
});

test('area 29 reads only the Salmon tab (WET details tabs)', () => {
  const html = `<main><div class="wb-tabs"><div class="tabpanels">
    <details id="crab"><summary>Crab</summary><table><tr><th>Area</th><th>Limit</th></tr><tr><td>Subareas 29-9 to 29-17</td><td>Closed to crab, no salmon here</td></tr></table></details>
    <details id="salmon"><summary>Salmon</summary>
      <h3>Chinook</h3><table><tr><th>Area</th><th>Daily limit</th></tr>
        <tr><td>Subareas 29-1 to 29-5</td><td>2</td></tr>
        <tr><td>Subareas 29-6, 29-7, and 29-9 to 29-17</td><td>0 – closed</td></tr></table>
      <h3>Coho</h3><ul><li>Subareas 29-9 to 29-17: closed, daily limit 0.</li></ul>
    </details>
    <details id="prawn"><summary>Prawn and shrimp</summary><p>Subarea 29-11: closed to prawns, daily limit 0.</p></details>
  </div></div></main>`;
  const d = parseArea29(html);
  assert.equal(d.scope, 'salmon-tab');
  assert.equal(d.anchor, 'salmon');
  assert.equal(d.rows.length, 3); // crab and prawn tabs ignored
  assert.equal(d.status, 'closed');
  assert.equal(tidalStatus(d, subScope(2), '10-21', 'All'), 'open');
  assert.equal(tidalStatus(d, subScope(13), '10-21', 'All'), 'closed');
});

test('area 29 tab list pointing at a panel id', () => {
  const html = `<main><ul role="tablist"><li><a href="#tab-g">Groundfish</a></li><li><a role="tab" href="#tab-s" aria-controls="tab-s">Salmon</a></li></ul>
    <div id="tab-g"><p>Subarea 29-11 closed to lingcod, daily limit 0.</p></div>
    <div id="tab-s"><p>Fraser River tidal waters: sockeye non-retention.</p></div></main>`;
  const d = parseArea29(html);
  assert.equal(d.anchor, 'tab-s');
  assert.deepEqual(d.rows.map((r) => r.kind), ['closed']);
});

test('subarea ids from DFO map attributes, whatever the field names', () => {
  assert.deepEqual(subareaOf({ LABEL: '29-11', AREA: 29 }), { area: 29, sub: 11 });
  assert.deepEqual(subareaOf({ MGMT_AREA: 29, SUBAREA: 11 }), { area: 29, sub: 11 });
  assert.deepEqual(subareaOf({ MGMT_AREA: '29', SUBAREA_ID: '2911' }), { area: 29, sub: 11 });
  assert.deepEqual(subareaOf({ NAME: 'Subarea 29-7' }), { area: 29, sub: 7 });
  assert.equal(subareaOf({ OBJECTID: 5 }), null);
  const sq = (x: number, y: number) => [[[x, y], [x + 0.1, y], [x + 0.1, y + 0.1], [x, y + 0.1], [x, y]]];
  const shapes = processSubareas([
    { properties: { LABEL: '29-11' }, geometry: { type: 'Polygon', coordinates: sq(-123.2, 49.1) } },
    { properties: { LABEL: '28-1' }, geometry: { type: 'Polygon', coordinates: sq(-123.4, 49.4) } },
    { properties: { LABEL: '29-11' }, geometry: { type: 'Polygon', coordinates: sq(-123.0, 49.2) } },
  ]);
  assert.equal(shapes.length, 1); // area 28 dropped, two parts merged
  assert.equal(shapes[0].polygons.length, 2);
  assert.deepEqual(shapes[0].polygons[0][0][0], [49.1, -123.2]); // swapped to [lat, lng]
  assert.ok(Math.abs(shapes[0].center[0] - 49.15) < 1e-6 || Math.abs(shapes[0].center[0] - 49.25) < 1e-6);
});
