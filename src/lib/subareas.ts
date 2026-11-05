import { fetchText } from './http';
import { simplify } from './geometry';
import { logAttempt, readJson, writeJson } from './store';
import type { LatLng, SubareaShape } from './types';

/**
 * Area 29 subarea boundaries from DFO's open map service (Pacific Fishery Management Subareas, 1:50K).
 * Downloaded once and kept in the data volume, like the river lines.
 */
// egisp = DFO's public map server (gisp/gist are internal and not reachable from home networks)
const SERVICES = [
  'https://egisp.dfo-mpo.gc.ca/arcgis/rest/services/Pacific/DFO_BC_PFMA_SUBAREAS_50K_V3_1/MapServer/0',
  'https://gisp.dfo-mpo.gc.ca/arcgis/rest/services/Pacific/DFO_BC_PFMA_SUBAREAS_50K_V3_1/MapServer/0',
];
const AREA = 29;
// lon/lat box around Area 29 (Strait of Georgia south of Sechelt to Mission); filtering by area happens below
const ENVELOPE = '-124.3,48.55,-121.8,49.85';

interface GeoJsonFeature {
  properties: Record<string, unknown> | null;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] } | null;
}

/** Find "29-11" in a feature's attributes without relying on exact field names. */
export function subareaOf(props: Record<string, unknown> | null): { area: number; sub: number } | null {
  if (!props) return null;
  const entries = Object.entries(props);
  for (const [, v] of entries) {
    const m = typeof v === 'string' && v.match(/^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/);
    if (m) return { area: Number(m[1]), sub: Number(m[2]) };
  }
  for (const [k, v] of entries) {
    if (!/label|name|sub/i.test(k) || typeof v !== 'string') continue;
    const m = v.match(/\b(\d{1,3})-(\d{1,3})\b/);
    if (m) return { area: Number(m[1]), sub: Number(m[2]) };
  }
  const num = (k: string) => {
    const v = props[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const areaKey = entries.map(([k]) => k).find((k) => /^(mgmt_?area|management_?area|pfma|area|area_?id|area_?num)$/i.test(k));
  const subKey = entries.map(([k]) => k).find((k) => /^(sub_?area|subarea_?id|subarea_?num|sub_?num|sub)$/i.test(k));
  if (areaKey && subKey && num(areaKey) !== null && num(subKey) !== null) {
    const a = num(areaKey)!;
    let s = num(subKey)!;
    if (s >= 100) s = s % 100; // some datasets store 2911
    return { area: a, sub: s };
  }
  return null;
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function toShape(sub: number, f: GeoJsonFeature): LatLng[][][] {
  const g = f.geometry;
  if (!g) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
  return polys.map((rings) => rings.map((ring) => simplify(ring.map(([x, y]) => [y, x] as LatLng), 25).map(([a, b]) => [r5(a), r5(b)] as LatLng)));
}

function centerOf(polygons: LatLng[][][]): LatLng {
  // centre of the largest outer ring's bounding box: good enough for a label
  let best: LatLng[] = polygons[0]?.[0] ?? [];
  let bestArea = -1;
  for (const p of polygons) {
    const ring = p[0];
    const lat = ring.map((q) => q[0]);
    const lng = ring.map((q) => q[1]);
    const a = (Math.max(...lat) - Math.min(...lat)) * (Math.max(...lng) - Math.min(...lng));
    if (a > bestArea) { bestArea = a; best = ring; }
  }
  // area-weighted centroid of that ring
  let A = 0, cx = 0, cy = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const [y1, x1] = best[j];
    const [y2, x2] = best[i];
    const c = x1 * y2 - x2 * y1;
    A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  if (Math.abs(A) < 1e-12) return best[0] ?? [49.2, -123.2];
  return [r5(cy / (3 * A)), r5(cx / (3 * A))];
}

export function processSubareas(features: GeoJsonFeature[]): SubareaShape[] {
  const bySub = new Map<number, LatLng[][][]>();
  for (const f of features) {
    const id = subareaOf(f.properties);
    if (!id || id.area !== AREA) continue;
    const shape = toShape(id.sub, f);
    if (shape.length) bySub.set(id.sub, [...(bySub.get(id.sub) ?? []), ...shape]);
  }
  return [...bySub.entries()].sort((a, b) => a[0] - b[0]).map(([sub, polygons]) => ({ sub, polygons, center: centerOf(polygons) }));
}

let retry: NodeJS.Timeout | null = null;

/** Download once; later calls are no-ops unless forced. */
export async function ensureSubareas(force = false): Promise<boolean> {
  if (!force && (await readJson<SubareaShape[]>('subareas.json'))) return true;
  for (const svc of SERVICES) {
    try {
      const features: GeoJsonFeature[] = [];
      const get = async (params: Record<string, string>) => {
        const q = new URLSearchParams({ outFields: '*', returnGeometry: 'true', outSR: '4326', geometryPrecision: '5', maxAllowableOffset: '0.0001', f: 'geojson', ...params });
        const page = JSON.parse(await fetchText(`${svc}/query?${q}`, {}, 2)) as { features?: GeoJsonFeature[]; exceededTransferLimit?: boolean; error?: { message?: string } };
        if (page.error) throw new Error(page.error.message ?? 'service error');
        return page;
      };
      try {
        // the service has MGNT_AREA / SUBAREA_ / LABEL fields: ask for Area 29 only (17 polygons, ~100 KB)
        features.push(...((await get({ where: `MGNT_AREA=${AREA}` })).features ?? []));
      } catch {
        // field names changed? fall back to everything inside a box around Area 29
        for (let offset = 0; offset < 20000; offset += 1000) {
          const page = await get({ where: '1=1', geometry: ENVELOPE, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', resultOffset: String(offset), resultRecordCount: '1000' });
          features.push(...(page.features ?? []));
          if (!page.exceededTransferLimit && (page.features?.length ?? 0) < 1000) break;
        }
      }
      const shapes = processSubareas(features);
      if (shapes.length < 5) {
        const sample = features[0]?.properties ? Object.keys(features[0].properties).join(', ') : 'none';
        throw new Error(`only ${shapes.length} Area 29 subareas recognised from ${features.length} features (fields: ${sample})`);
      }
      await writeJson('subareas.json', shapes);
      await logAttempt('subareas', true);
      console.log(`[salmon] Area 29 subareas saved (${shapes.length}: ${shapes.map((s) => `29-${s.sub}`).join(', ')}). They won't be downloaded again.`);
      return true;
    } catch (err) {
      console.warn(`[salmon] Subareas from ${svc} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  await logAttempt('subareas', false, 'DFO map service unreachable or returned no Area 29 subareas');
  if (retry) clearTimeout(retry);
  retry = setTimeout(() => void ensureSubareas(), 30 * 60 * 1000);
  return false;
}

export async function getSubareas(): Promise<SubareaShape[]> {
  return (await readJson<SubareaShape[]>('subareas.json')) ?? [];
}
