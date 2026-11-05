import type { SectionGeo } from './geo';
import type { LatLng } from './types';

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                     */
/* ------------------------------------------------------------------ */

export function dist(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR;
  const dLng = (b[1] - a[1]) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

interface Chain { pts: LatLng[]; fw: number; bw: number; dead?: boolean }

const key = (p: LatLng) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

function join(a: Chain, aStart: boolean, b: Chain, bStart: boolean) {
  const rev = (p: LatLng[]) => p.slice().reverse();
  if (!aStart && bStart) { a.pts = a.pts.concat(b.pts.slice(1)); a.fw += b.fw; a.bw += b.bw; }
  else if (!aStart && !bStart) { a.pts = a.pts.concat(rev(b.pts).slice(1)); a.fw += b.bw; a.bw += b.fw; }
  else if (aStart && !bStart) { a.pts = b.pts.concat(a.pts.slice(1)); a.fw += b.fw; a.bw += b.bw; }
  else { a.pts = rev(b.pts).concat(a.pts.slice(1)); a.fw += b.bw; a.bw += b.fw; }
  b.dead = true;
}

/**
 * Join OSM ways into continuous lines. Ways meet at shared nodes; we only join where exactly two ways meet
 * (so tributary junctions stay separate), then close small gaps between dangling ends. Lines are oriented
 * downstream using the OSM convention that waterways are drawn in the direction of flow.
 */
export function chainWays(ways: LatLng[][], gapMetres = 40): LatLng[][] {
  const chains: Chain[] = ways.filter((w) => w.length > 1).map((w) => ({ pts: w.slice(), fw: w.length, bw: 0 }));
  const alive = () => chains.filter((c) => !c.dead);

  for (let changed = true; changed; ) {
    changed = false;
    const ends = new Map<string, { c: Chain; start: boolean }[]>();
    for (const c of alive()) {
      for (const start of [true, false]) {
        const k = key(start ? c.pts[0] : c.pts[c.pts.length - 1]);
        (ends.get(k) ?? ends.set(k, []).get(k)!).push({ c, start });
      }
    }
    for (const list of ends.values()) {
      if (list.length === 2 && list[0].c !== list[1].c) {
        join(list[0].c, list[0].start, list[1].c, list[1].start);
        changed = true;
        break;
      }
    }
  }

  // close small gaps between dangling ends
  for (let changed = true; changed; ) {
    changed = false;
    const cs = alive();
    outer: for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        for (const as of [false, true]) for (const bs of [true, false]) {
          const pa = as ? a.pts[0] : a.pts[a.pts.length - 1];
          const pb = bs ? b.pts[0] : b.pts[b.pts.length - 1];
          if (dist(pa, pb) < gapMetres) { join(a, as, b, bs); changed = true; break outer; }
        }
      }
    }
  }

  return alive()
    .map((c) => (c.bw > c.fw ? c.pts.slice().reverse() : c.pts))
    .sort((a, b) => b.length - a.length);
}

/** Douglas–Peucker simplification, tolerance in metres. */
export function simplify(pts: LatLng[], tolM: number): LatLng[] {
  if (pts.length < 3) return pts;
  const lat0 = (pts[0][0] * Math.PI) / 180;
  const mx = 111320 * Math.cos(lat0);
  const my = 110540;
  const xy = pts.map(([la, lo]) => [lo * mx, la * my]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-9;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const t = Math.max(0, Math.min(1, ((xy[i][0] - x1) * dx + (xy[i][1] - y1) * dy) / len2));
      const px = x1 + t * dx - xy[i][0], py = y1 + t * dy - xy[i][1];
      const d = px * px + py * py;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > tolM * tolM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function nearest(chain: LatLng[], p: LatLng) {
  let i = 0, d = Infinity;
  chain.forEach((q, k) => {
    const dd = dist(q, p);
    if (dd < d) { d = dd; i = k; }
  });
  return { i, d };
}

/** Cut a section's open stretch out of a river's chains. */
export function clipSection(chains: LatLng[][], s: Pick<SectionGeo, 'from' | 'to' | 'splitLng'>): LatLng[][] {
  if (s.splitLng) {
    const out: LatLng[][] = [];
    for (const c of chains) {
      let seg: LatLng[] = [];
      for (const p of c) {
        const inside = s.splitLng.side === 'east' ? p[1] > s.splitLng.lng : p[1] <= s.splitLng.lng;
        if (inside) seg.push(p);
        else { if (seg.length > 1) out.push(seg); seg = []; }
      }
      if (seg.length > 1) out.push(seg);
    }
    return out;
  }
  if (!s.from && !s.to) return chains;
  const SNAP = 3000;
  let best: { c: LatLng[]; i: number; j: number; score: number } | null = null;
  for (const c of chains) {
    const a = s.from ? nearest(c, s.from) : { i: 0, d: 0 };
    const b = s.to ? nearest(c, s.to) : { i: c.length - 1, d: 0 };
    const score = a.d + b.d;
    if (a.d < SNAP && b.d < SNAP && (!best || score < best.score)) best = { c, i: a.i, j: b.i, score };
  }
  if (!best) return [];
  const i = Math.min(best.i, best.j);
  const j = Math.max(best.i, best.j);
  const seg = best.c.slice(i, j + 1);
  return seg.length > 1 ? [seg] : [];
}

