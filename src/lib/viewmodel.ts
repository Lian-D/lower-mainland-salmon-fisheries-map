import { WATERS_GEO } from './geo';
import type { Entry, Region2Data, WaterVM } from './types';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Group DFO entries by water and attach them to map sections. Waters DFO adds later still show up (list only). */
export function buildWaters(region2: Region2Data): WaterVM[] {
  const byWater = new Map<string, Entry[]>();
  for (const e of region2.entries) (byWater.get(e.water) ?? byWater.set(e.water, []).get(e.water)!).push(e);
  const changed = new Set(region2.changes?.waters ?? []);

  const out: WaterVM[] = [];
  for (const [name, entries] of byWater) {
    const geo = WATERS_GEO.find((g) => g.match.test(name));
    if (!geo) {
      out.push({ id: slug(name), name, pin: null, entries, sections: [], mapped: false, changed: changed.has(name) });
      continue;
    }
    const claimed = new Set<number>();
    const sections = geo.sections.map((s) => {
      const idx = s.areaMatch ? entries.flatMap((e, i) => (s.areaMatch!.test(e.area) ? [i] : [])) : [];
      idx.forEach((i) => claimed.add(i));
      return { id: s.id, idx, general: !s.areaMatch };
    });
    const unclaimed = entries.flatMap((_, i) => (claimed.has(i) ? [] : [i]));
    out.push({
      id: geo.id,
      name,
      pin: geo.pin,
      entries,
      sections: sections.map((s) => ({ id: s.id, entryIdx: s.general ? unclaimed : s.idx })),
      mapped: true,
      changed: changed.has(name),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
