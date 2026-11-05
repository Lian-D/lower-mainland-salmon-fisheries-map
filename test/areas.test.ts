import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleRings, processAreas, sectionShape } from '../src/lib/riverAreas.ts';
import type { LatLng } from '../src/lib/types.ts';

test('multipolygon member ways join into rings (any direction), islands become holes', () => {
  const a: LatLng[] = [[49, -122], [49, -122.1]];
  const b: LatLng[] = [[49.01, -122.1], [49, -122.1]]; // reversed piece
  const c: LatLng[] = [[49.01, -122.1], [49.01, -122], [49, -122]];
  const rings = assembleRings([a, b, c]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  const polys = processAreas([
    { type: 'relation', members: [
      { type: 'way', role: 'outer', geometry: a.map(([lat, lon]) => ({ lat, lon })) },
      { type: 'way', role: 'outer', geometry: b.map(([lat, lon]) => ({ lat, lon })) },
      { type: 'way', role: 'outer', geometry: c.map(([lat, lon]) => ({ lat, lon })) },
      { type: 'way', role: 'inner', geometry: [[49.004, -122.05], [49.006, -122.05], [49.006, -122.04], [49.004, -122.04], [49.004, -122.05]].map(([lat, lon]) => ({ lat, lon })) },
    ] },
    { type: 'way', geometry: [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }] }, // not closed: ignored
  ]);
  assert.equal(polys.length, 1);
  assert.equal(polys[0].length, 2); // outer + island hole
});

test('river outline is cut to the open stretch only', () => {
  // a straight river 0.1° long and ~220 m wide, flowing west
  const river: LatLng[][][] = [[[[48.999, -122.0], [49.001, -122.0], [49.001, -122.1], [48.999, -122.1], [48.999, -122.0]]]];
  const elsewhere: LatLng[][][] = [[[[49.2, -122.0], [49.21, -122.0], [49.21, -122.1], [49.2, -122.1], [49.2, -122.0]]]];
  const stretch: LatLng[] = [[49, -122.03], [49, -122.05], [49, -122.07]];
  const shape = sectionShape([stretch], [...river, ...elsewhere], { from: [49, -122.03], to: [49, -122.07] })!;
  assert.ok(shape);
  assert.equal(shape.length, 1); // the far-away outline isn't picked up
  const lngs = shape[0][0].map((p) => p[1]);
  assert.ok(Math.max(...lngs) <= -122.0299 && Math.min(...lngs) >= -122.0701, `cut at the stretch ends: ${Math.min(...lngs)}..${Math.max(...lngs)}`);
  const lats = shape[0][0].map((p) => p[0]);
  assert.ok(Math.min(...lats) <= 48.9991 && Math.max(...lats) >= 49.0009); // full river width kept
  // without from/to the whole matching outline is used
  const whole = sectionShape([stretch], river, {})!;
  assert.ok(Math.max(...whole[0][0].map((p) => p[1])) > -122.03);
  // no outline nearby → keep the line
  assert.equal(sectionShape([[[50, -123], [50, -123.1]]], river, {}), null);
});

test('a creek does not pick up the river it flows into', () => {
  // big river running north-south at lng -122.0 (600 m wide); creek flows east→west into it, ending on its centre line
  const bigRiver: LatLng[][][] = [[[[48.95, -122.004], [49.05, -122.004], [49.05, -121.996], [48.95, -121.996], [48.95, -122.004]]]];
  const creekOutline: LatLng[][][] = [[[[48.9998, -121.996], [49.0002, -121.996], [49.0002, -121.95], [48.9998, -121.95], [48.9998, -121.996]]]];
  const creek: LatLng[] = [[49, -121.95], [49, -121.97], [49, -121.99], [49, -122.0]];
  const shape = sectionShape([creek], [...bigRiver, ...creekOutline], {})!;
  assert.ok(shape);
  const lngs = shape.flatMap((p) => p[0].map((q) => q[1]));
  assert.ok(Math.min(...lngs) >= -121.9961, `stays out of the big river: ${Math.min(...lngs)}`);
  // and with no creek outline at all, it falls back to the line
  assert.equal(sectionShape([creek], bigRiver, {}), null);
});

test('the same water mapped twice is merged into one shape', () => {
  const a: LatLng[][][] = [[[[48.999, -122.0], [49.001, -122.0], [49.001, -122.1], [48.999, -122.1], [48.999, -122.0]]]];
  const b: LatLng[][][] = [[[[48.9992, -122.0], [49.0012, -122.0], [49.0012, -122.1], [48.9992, -122.1], [48.9992, -122.0]]]]; // overlapping copy
  const shape = sectionShape([[[49, -122.02], [49, -122.05], [49, -122.08]]], [...a, ...b], {})!;
  assert.equal(shape.length, 1); // one polygon, not two overlapping ones
  const lats = shape[0][0].map((p) => p[0]);
  assert.ok(Math.min(...lats) <= 48.9991 && Math.max(...lats) >= 49.0011);
});
