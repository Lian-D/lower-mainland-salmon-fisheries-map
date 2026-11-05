import { BBOX, MISSION_CPR_BRIDGE, TIDAL_FRASER, WATERS_GEO, type SectionGeo } from './geo';
import { fetchText } from './http';
import { chainWays, clipSection, simplify } from './geometry';
import { logAttempt, readJson, writeJson } from './store';
import { getSubareas } from './subareas';
import { sectionShape, type RiverAreas } from './riverAreas';
import type { LatLng, RiverGeometry } from './types';

/* ------------------------------------------------------------------ */
/* One-time download from OpenStreetMap (Overpass API, no key needed)  */
/* ------------------------------------------------------------------ */

interface RawRivers {
  fetchedAt: string;
  names: Record<string, { lines: LatLng[][]; polys: LatLng[][] }>;
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildQuery(): string {
  const lineNames = [...new Set(WATERS_GEO.flatMap((w) => w.sections.filter((s) => !s.lake).flatMap((s) => s.osm)))];
  const lakeNames = [...new Set(WATERS_GEO.flatMap((w) => w.sections.filter((s) => s.lake).flatMap((s) => s.osm)))];
  const lineRe = `^(${lineNames.map(esc).join('|')})$`;
  const lakeRe = `^(${lakeNames.map(esc).join('|')})$`;
  return `[out:json][timeout:180];(
  way["waterway"~"^(river|stream|canal|ditch|drain)$"]["name"~"${lineRe}"](${BBOX});
  way["waterway"~"^(river|canal|stream)$"]["name"~"Fraser|^Canoe Pass$"](${BBOX});
  way["natural"="water"]["name"~"${lakeRe}"](${BBOX});
  relation["natural"="water"]["name"~"${lakeRe}"](${BBOX});
);out geom;`;
}

let retryTimer: NodeJS.Timeout | null = null;

/** Download river lines once; later calls are no-ops unless `force` is set. */
export async function ensureRivers(force = false): Promise<boolean> {
  if (!force && (await readJson<RawRivers>('rivers-raw.json'))) return true;
  const g = globalThis as unknown as { __riversLoading?: Promise<boolean> };
  if (g.__riversLoading) return g.__riversLoading;
  g.__riversLoading = (async () => {
    const body = 'data=' + encodeURIComponent(buildQuery());
    let lastErr = '';
    for (const ep of ENDPOINTS) {
      try {
        console.log(`[salmon] Downloading river lines from ${ep} …`);
        const text = await fetchText(ep, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 2);
        const raw = processOverpass(JSON.parse(text));
        if (!Object.keys(raw.names).length) throw new Error('Overpass returned no waterways');
        await writeJson('rivers-raw.json', raw);
        cache = null;
        await logAttempt('rivers', true);
        console.log(`[salmon] River lines saved (${Object.keys(raw.names).length} named waterways). They won't be downloaded again.`);
        return true;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        console.warn(`[salmon] ${ep} failed: ${lastErr}`);
      }
    }
    await logAttempt('rivers', false, lastErr);
    // try again in 30 minutes
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void ensureRivers(), 30 * 60 * 1000);
    return false;
  })().finally(() => {
    g.__riversLoading = undefined;
  });
  return g.__riversLoading;
}

interface OverpassEl {
  type: 'way' | 'relation';
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { role: string; geometry?: { lat: number; lon: number }[] }[];
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function processOverpass(data: { elements: OverpassEl[] }): RawRivers {
  const ways: Record<string, LatLng[][]> = {};
  const polys: Record<string, LatLng[][]> = {};
  for (const el of data.elements) {
    const name = el.tags?.name;
    if (!name) continue;
    if (el.type === 'way' && el.geometry) {
      const ll = el.geometry.map((p) => [p.lat, p.lon] as LatLng);
      if (el.tags?.waterway) (ways[name] ??= []).push(ll);
      else (polys[name] ??= []).push(ll);
    } else if (el.type === 'relation' && el.members) {
      for (const m of el.members) if (m.role === 'outer' && m.geometry) (polys[name] ??= []).push(m.geometry.map((p) => [p.lat, p.lon] as LatLng));
    }
  }
  const names: RawRivers['names'] = {};
  for (const n of new Set([...Object.keys(ways), ...Object.keys(polys)])) {
    names[n] = {
      lines: chainWays(ways[n] ?? []).map((c) => simplify(c, 4).map(([a, b]) => [r5(a), r5(b)] as LatLng)),
      polys: (polys[n] ?? []).map((p) => simplify(p, 4).map(([a, b]) => [r5(a), r5(b)] as LatLng)),
    };
  }
  return { fetchedAt: new Date().toISOString(), names };
}

/* ------------------------------------------------------------------ */
/* Geometry served to the browser                                      */
/* ------------------------------------------------------------------ */

let cache: Omit<RiverGeometry, 'subareas' | 'shapes'> | null = null;

let shapeCache: { key: string; shapes: RiverGeometry['shapes'] } | null = null;

/** Cut river outlines to each open stretch; cached until the line or outline data changes. */
async function buildShapes(rivers: Omit<RiverGeometry, 'subareas' | 'shapes'>): Promise<{ key: string; shapes: RiverGeometry['shapes'] }> {
  const areas = await readJson<RiverAreas>('river-areas.json');
  const key = `${rivers.version}:${areas?.fetchedAt ?? 'none'}`;
  if (shapeCache?.key === key) return shapeCache;
  const shapes: RiverGeometry['shapes'] = {};
  if (areas) {
    const t0 = Date.now();
    for (const w of WATERS_GEO) for (const s of w.sections) {
      const lines = rivers.sections[s.id];
      if (!lines) continue;
      const shape = sectionShape(lines, areas.polygons, s);
      if (shape) shapes[s.id] = shape;
    }
    console.log(`[salmon] River outlines matched for ${Object.keys(shapes).length} of ${Object.keys(rivers.sections).length} stretches (${Date.now() - t0} ms)`);
  }
  shapeCache = { key, shapes };
  return shapeCache;
}

/** River lines + outlines (cached in memory) + Area 29 subareas (read each time, since they may arrive later). */
export async function getRiverGeometry(): Promise<RiverGeometry> {
  const subareas = await getSubareas();
  const rivers = cache ?? (await buildRivers());
  const ready = !!rivers;
  const shaped = rivers ? await buildShapes(rivers) : { key: 'none', shapes: {} };
  return {
    ...(rivers ?? { sections: {}, lakes: {}, context: [], tidal: [], missing: [] }),
    ready,
    riversReady: ready,
    subareasReady: subareas.length > 0,
    areasReady: Object.keys(shaped.shapes).length > 0,
    version: `${shaped.key}:${subareas.length}`,
    shapes: shaped.shapes,
    subareas,
  };
}

async function buildRivers(): Promise<Omit<RiverGeometry, 'subareas' | 'shapes'> | null> {
  const raw = await readJson<RawRivers>('rivers-raw.json');
  if (!raw) return null;

  const sections: RiverGeometry['sections'] = {};
  const lakes: RiverGeometry['lakes'] = {};
  const missing: string[] = [];
  for (const w of WATERS_GEO) {
    for (const s of w.sections) {
      if (s.lake) {
        const polys = s.osm.flatMap((n) => raw.names[n]?.polys ?? []);
        if (polys.length) lakes[s.id] = polys;
        else missing.push(s.id);
        continue;
      }
      // clip across all of the section's OSM names at once so a boundary point picks the single best line
      const lines = clipSection(s.osm.flatMap((n) => raw.names[n]?.lines ?? []), s);
      if (lines.length) sections[s.id] = lines;
      else missing.push(s.id);
    }
  }
  const context: LatLng[][] = [];
  const tidal: LatLng[][] = [];
  for (const [name, g] of Object.entries(raw.names)) {
    if (TIDAL_FRASER.test(name)) {
      tidal.push(...clipSection(g.lines, { splitLng: { lng: MISSION_CPR_BRIDGE[1], side: 'west' } }));
    } else {
      context.push(...g.lines);
    }
  }
  cache = { ready: true, version: raw.fetchedAt, sections, lakes, context, tidal, missing };
  return cache;
}
