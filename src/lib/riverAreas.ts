import bufferMod from '@turf/buffer';
import intersectMod from '@turf/intersect';
import booleanIntersectsMod from '@turf/boolean-intersects';
import unionMod from '@turf/union';
import { featureCollection, lineString, multiLineString, polygon as tPolygon } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { WATERS_GEO, type SectionGeo } from './geo';
import { clipSection, dist, simplify } from './geometry';
import { fetchText } from './http';
import { logAttempt, readJson, writeJson } from './store';
import type { LatLng } from './types';

// these packages ship CJS + ESM; normalise the default export
const buffer = ((bufferMod as unknown as { default?: typeof bufferMod }).default ?? bufferMod) as typeof bufferMod;
const intersect = ((intersectMod as unknown as { default?: typeof intersectMod }).default ?? intersectMod) as typeof intersectMod;
const union = ((unionMod as unknown as { default?: typeof unionMod }).default ?? unionMod) as typeof unionMod;
const booleanIntersects = ((booleanIntersectsMod as unknown as { default?: typeof booleanIntersectsMod }).default ?? booleanIntersectsMod) as typeof booleanIntersectsMod;

/**
 * River outlines (the water area, not the centre line) from OpenStreetMap, downloaded once.
 * Many OSM river areas carry no name, so we fetch every river area within 60 m of the named waterways we use,
 * then match them to open stretches by where the centre line runs.
 */
export interface RiverAreas {
  fetchedAt: string;
  /** polygons: [outer ring, ...holes], each ring as [lat, lng] */
  polygons: LatLng[][][];
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Small boxes around every open stretch (from the river lines we already have), so Overpass can answer
 * from its spatial index quickly instead of running a slow "near these ways" search.
 */
async function stretchBoxes(): Promise<string[]> {
  const raw = await readJson<{ names: Record<string, { lines: LatLng[][] }> }>('rivers-raw.json');
  if (!raw) return [];
  const boxes: string[] = [];
  for (const w of WATERS_GEO) for (const s of w.sections) {
    if (s.lake) continue;
    const lines = clipSection(s.osm.flatMap((n) => raw.names[n]?.lines ?? []), s);
    const pts = lines.flat();
    if (!pts.length) continue;
    const lat = pts.map((p) => p[0]);
    const lng = pts.map((p) => p[1]);
    const pad = 0.005;
    boxes.push([Math.min(...lat) - pad, Math.min(...lng) - pad, Math.max(...lat) + pad, Math.max(...lng) + pad].map((n) => n.toFixed(4)).join(','));
  }
  return boxes;
}

function buildQuery(boxes: string[]): string {
  const parts = boxes.flatMap((b) => [
    `way["natural"="water"]["water"~"^(river|canal|oxbow|stream|rapids)$"](${b});`,
    `relation["natural"="water"]["water"~"^(river|canal|oxbow|stream)$"](${b});`,
    `way["waterway"="riverbank"](${b});`,
    `relation["waterway"="riverbank"](${b});`,
  ]);
  return `[out:json][timeout:300][maxsize:1073741824];\n(\n${parts.join('\n')}\n);\nout geom;`;
}

interface OsmEl {
  type: 'way' | 'relation';
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

const key = (p: LatLng) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
const closed = (r: LatLng[]) => r.length >= 4 && key(r[0]) === key(r[r.length - 1]);

/** Join the member ways of a multipolygon into closed rings. */
export function assembleRings(parts: LatLng[][]): LatLng[][] {
  const open = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const rings: LatLng[][] = [];
  while (open.length) {
    let cur = open.shift()!;
    for (let guard = 0; !closed(cur) && guard < 10000; guard++) {
      const end = key(cur[cur.length - 1]);
      const j = open.findIndex((p) => key(p[0]) === end || key(p[p.length - 1]) === end);
      if (j < 0) break;
      const next = open.splice(j, 1)[0];
      cur = cur.concat((key(next[0]) === end ? next : next.slice().reverse()).slice(1));
    }
    if (closed(cur)) rings.push(cur);
    else if (cur.length >= 3 && dist(cur[0], cur[cur.length - 1]) < 50) rings.push([...cur, cur[0]]);
  }
  return rings;
}

function pointInRing(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const tidy = (ring: LatLng[]) => {
  const s = simplify(ring, 4).map(([a, b]) => [r5(a), r5(b)] as LatLng);
  if (key(s[0]) !== key(s[s.length - 1])) s.push(s[0]);
  return s;
};

export function processAreas(elements: OsmEl[]): LatLng[][][] {
  const out: LatLng[][][] = [];
  for (const el of elements) {
    if (el.type === 'way' && el.geometry) {
      const ring = el.geometry.map((p) => [p.lat, p.lon] as LatLng);
      if (closed(ring)) out.push([tidy(ring)]);
    } else if (el.type === 'relation' && el.members) {
      const geo = (role: string) => el.members!.filter((m) => m.type === 'way' && m.role === role && m.geometry).map((m) => m.geometry!.map((p) => [p.lat, p.lon] as LatLng));
      const outers = assembleRings(geo('outer'));
      const inners = assembleRings(geo('inner'));
      const polys: LatLng[][][] = outers.map((o) => [o]);
      for (const inner of inners) {
        const host = polys.find((p) => pointInRing(inner[0], p[0]));
        if (host) host.push(inner);
      }
      for (const p of polys) out.push(p.map(tidy).filter((r) => r.length >= 4));
    }
  }
  return out.filter((p) => p.length && p[0].length >= 4);
}

let retry: NodeJS.Timeout | null = null;

export async function ensureRiverAreas(force = false): Promise<boolean> {
  if (!force && (await readJson<RiverAreas>('river-areas.json'))) return true;
  const g = globalThis as unknown as { __areasLoading?: Promise<boolean> };
  if (g.__areasLoading) return g.__areasLoading;
  g.__areasLoading = (async () => {
    const boxes = await stretchBoxes();
    if (!boxes.length) return false; // river lines first
    const body = 'data=' + encodeURIComponent(buildQuery(boxes));
    let lastErr = '';
    for (const ep of ENDPOINTS) {
      try {
        console.log(`[salmon] Downloading river outlines from ${ep} …`);
        const t0 = Date.now();
        const text = await fetchText(ep, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 2, 330_000);
        console.log(`[salmon] Overpass answered in ${Math.round((Date.now() - t0) / 1000)} s (${Math.round(text.length / 1024)} KB)`);
        const polygons = processAreas((JSON.parse(text) as { elements: OsmEl[] }).elements);
        if (!polygons.length) throw new Error('no river outlines returned');
        await writeJson('river-areas.json', { fetchedAt: new Date().toISOString(), polygons } satisfies RiverAreas);
        await logAttempt('riverAreas', true);
        console.log(`[salmon] River outlines saved (${polygons.length} polygons). They won't be downloaded again.`);
        return true;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        console.warn(`[salmon] River outlines from ${ep} failed: ${lastErr}`);
      }
    }
    await logAttempt('riverAreas', false, lastErr);
    if (retry) clearTimeout(retry);
    retry = setTimeout(() => void ensureRiverAreas(), 30 * 60 * 1000);
    return false;
  })().finally(() => {
    g.__areasLoading = undefined;
  });
  return g.__areasLoading;
}

/* ------------------------------------------------------------------ */
/* Cut the outlines to each open stretch                               */
/* ------------------------------------------------------------------ */

const CORRIDOR_M = 450; // wider than any Region 2 river is half-wide, so the whole width is kept

const toLngLat = (p: LatLng) => [p[1], p[0]];
const toLatLng = (c: number[]) => [r5(c[1]), r5(c[0])] as LatLng;

/** A box behind an end point (pointing away from the stretch), used to cut off the round end of the buffer. */
function capBox(end: LatLng, inner: LatLng, size: number): Feature<Polygon> {
  const mLat = 110540;
  const mLng = 111320 * Math.cos((end[0] * Math.PI) / 180);
  let dx = (inner[1] - end[1]) * mLng;
  let dy = (inner[0] - end[0]) * mLat;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len; // unit vector into the stretch
  const nx = -dy, ny = dx; // perpendicular
  const pt = (a: number, b: number) => [end[1] + (dx * a + nx * b) / mLng, end[0] + (dy * a + ny * b) / mLat];
  const s = size * 1.3;
  return tPolygon([[pt(0, -s), pt(-s, -s), pt(-s, s), pt(0, s), pt(0, -s)]]);
}

function minus(a: Feature<Polygon | MultiPolygon>, b: Feature<Polygon>): Feature<Polygon | MultiPolygon> | null {
  // a − b == a ∩ (world − b); build "world − b" as a polygon with a hole
  const world = tPolygon([[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], b.geometry.coordinates[0].slice().reverse()]);
  return intersect(featureCollection([a, world]));
}

function insidePoly(p: LatLng, poly: LatLng[][]): boolean {
  if (!pointInRing(p, poly[0])) return false;
  return !poly.slice(1).some((hole) => pointInRing(p, hole));
}

/**
 * Does a line pass through this outline somewhere away from its two ends? Each end must be at least
 * `margin` along the line (500 m, or a quarter of a short line) from the inside point we find.
 */
export function runsThrough(lines: LatLng[][], poly: LatLng[][]): boolean {
  for (const line of lines) {
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
    const L = cum[cum.length - 1];
    const margin = Math.min(500, L * 0.25);
    for (let i = 0; i < line.length; i++) {
      if (cum[i] < margin || L - cum[i] < margin) continue;
      if (insidePoly(line[i], poly)) return true;
      // long segments: also test their midpoint
      if (i > 0 && cum[i] - cum[i - 1] > 50) {
        const mid: LatLng = [(line[i][0] + line[i - 1][0]) / 2, (line[i][1] + line[i - 1][1]) / 2];
        const cm = (cum[i] + cum[i - 1]) / 2;
        if (cm >= margin && L - cm >= margin && insidePoly(mid, poly)) return true;
      }
    }
  }
  return false;
}

/** Polygon rings for one section, or null when no outline matches (keep the line). */
export function sectionShape(lines: LatLng[][], polygons: LatLng[][][], s: Pick<SectionGeo, 'from' | 'to' | 'splitLng'>): LatLng[][][] | null {
  const usable = lines.filter((l) => l.length > 1);
  if (!usable.length) return null;
  const line = usable.length === 1 ? lineString(usable[0].map(toLngLat)) : multiLineString(usable.map((l) => l.map(toLngLat)));
  let corridor = buffer(line, CORRIDOR_M, { units: 'meters', steps: 6 }) as Feature<Polygon | MultiPolygon> | undefined;
  if (!corridor) return null;
  try {
    // cut the round ends where the stretch starts/stops at a boundary
    if (s.from && usable.length === 1 && usable[0].length > 1) corridor = minus(corridor, capBox(usable[0][0], usable[0][1], CORRIDOR_M)) ?? corridor;
    const last = usable[usable.length - 1];
    if (s.to && last.length > 1) corridor = minus(corridor, capBox(last[last.length - 1], last[last.length - 2], CORRIDOR_M)) ?? corridor;
    if (s.splitLng) {
      const lng = s.splitLng.lng;
      const half = s.splitLng.side === 'east'
        ? tPolygon([[[lng, -85], [180, -85], [180, 85], [lng, 85], [lng, -85]]])
        : tPolygon([[[-180, -85], [lng, -85], [lng, 85], [-180, 85], [-180, -85]]]);
      corridor = intersect(featureCollection([corridor, half])) ?? corridor;
    }
  } catch {
    /* keep the uncut corridor */
  }

  // bounding box prefilter
  const lats = usable.flat().map((p) => p[0]);
  const lngs = usable.flat().map((p) => p[1]);
  const pad = 0.01;
  const [s0, n0, w0, e0] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lngs) - pad, Math.max(...lngs) + pad];

  const pieces: Feature<Polygon | MultiPolygon>[] = [];
  for (const poly of polygons) {
    const outer = poly[0];
    let ps = 90, pn = -90, pw = 180, pe = -180;
    for (const [la, lo] of outer) { if (la < ps) ps = la; if (la > pn) pn = la; if (lo < pw) pw = lo; if (lo > pe) pe = lo; }
    if (pn < s0 || ps > n0 || pe < w0 || pw > e0) continue; // boxes don't overlap
    try {
      const tp = tPolygon(poly.map((ring) => ring.map(toLngLat)));
      if (!booleanIntersects(tp, line)) continue;
      // only outlines the stretch runs *through*: a creek's line ends inside the river it flows into,
      // which must not be coloured as part of the creek
      if (!runsThrough(usable, poly)) continue;
      const cut = intersect(featureCollection([tp, corridor]));
      if (cut) pieces.push(cut);
    } catch {
      /* invalid OSM polygon: skip it */
    }
  }
  if (!pieces.length) return null;
  // OSM often maps the same water twice (old riverbank + newer water area): merge so overlaps don't double up
  let merged: Feature<Polygon | MultiPolygon> | null = pieces[0];
  if (pieces.length > 1) {
    try {
      merged = union(featureCollection(pieces));
    } catch {
      merged = null;
    }
  }
  const src = merged ? [merged] : pieces;
  const out: LatLng[][][] = [];
  for (const f of src) {
    const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of parts) out.push(p.map((ring) => ring.map(toLatLng)));
  }
  return out.length ? out : null;
}
