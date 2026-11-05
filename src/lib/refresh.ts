import { AREA29_URL, parseArea29 } from './scrape/area29';
import { REGION2_URL, parseRegion2 } from './scrape/region2';
import { fetchPage, needsReparse, pageModified, type Validators } from './http';
import { logAttempt, readJson, writeJson } from './store';
import type { Area29Data, Region2Data } from './types';

/** Waters whose rules differ between two snapshots */
function changedWaters(prev: Region2Data | null, next: Region2Data): string[] {
  if (!prev) return [];
  const sig = (d: Region2Data) => {
    const m = new Map<string, string>();
    for (const e of d.entries) m.set(e.water, (m.get(e.water) ?? '') + JSON.stringify([e.area, e.rules.map((r) => [r.species, r.from, r.to, r.text])]));
    return m;
  };
  const a = sig(prev);
  const b = sig(next);
  const names = new Set([...a.keys(), ...b.keys()]);
  return [...names].filter((n) => a.get(n) !== b.get(n));
}

type Validated = Record<string, Validators>;

export interface RefreshResult {
  region2: { updated: boolean; modified: string | null; waters: number; warnings: string[] };
  area29: { updated: boolean; modified: string | null; status: string } | { error: string };
}

/**
 * Check both DFO pages. A page is only re-processed when its "Date modified" changed since the last
 * successful parse (or `force` is set). Otherwise we just record that we checked.
 */
export async function refreshRegulations(force = false): Promise<RefreshResult> {
  const g = globalThis as unknown as { __salmonRefreshing?: Promise<RefreshResult> };
  if (g.__salmonRefreshing) return g.__salmonRefreshing;
  g.__salmonRefreshing = (async () => {
    const now = new Date().toISOString();
    const validators = (await readJson<Validated>('http-validators.json')) ?? {};
    try {
      /* ---- Region 2 ---- */
      const prev = await readJson<Region2Data>('region2.json');
      const page = await fetchPage(REGION2_URL, {}, force || !prev ? null : validators[REGION2_URL]);
      let r2: RefreshResult['region2'];
      const modified = page.text ? pageModified(page.text) : prev?.sourceModified ?? null;
      if (page.notModified || !needsReparse(prev, modified, force)) {
        await writeJson('region2.json', { ...prev!, checkedAt: now });
        r2 = { updated: false, modified, waters: prev!.entries.length, warnings: [] };
        console.log(`[salmon] Region 2 unchanged (modified ${modified}); skipped re-processing`);
      } else {
        const region2 = parseRegion2(page.text!);
        region2.checkedAt = now;
        const changed = changedWaters(prev?.seed ? null : prev, region2);
        region2.changes = changed.length ? { at: now, waters: changed } : prev?.changes;
        await writeJson('region2.json', region2);
        if (region2.warnings.length) console.warn('[salmon] Region 2 parse warnings:', region2.warnings);
        console.log(`[salmon] Region 2 re-processed: ${region2.entries.length} entries, modified ${region2.sourceModified}${changed.length ? `, changed: ${changed.join(', ')}` : ''}`);
        r2 = { updated: true, modified: region2.sourceModified, waters: region2.entries.length, warnings: region2.warnings };
      }
      validators[REGION2_URL] = page.validators;

      /* ---- Area 29 ---- */
      let a29: RefreshResult['area29'];
      try {
        const prev29 = await readJson<Area29Data>('area29.json');
        const p29 = await fetchPage(AREA29_URL, {}, force || !prev29 ? null : validators[AREA29_URL]);
        const mod29 = p29.text ? pageModified(p29.text) : prev29?.sourceModified ?? null;
        if (p29.notModified || !needsReparse(prev29, mod29, force)) {
          await writeJson('area29.json', { ...prev29!, checkedAt: now });
          a29 = { updated: false, modified: mod29, status: prev29!.status };
          console.log(`[salmon] Area 29 unchanged (modified ${mod29}); skipped re-processing`);
        } else {
          const area29 = parseArea29(p29.text!);
          area29.checkedAt = now;
          // only flag a change when the previous copy was read the same way (structured vs fallback)
          const comparable = prev29 && !prev29.seed && prev29.hash && !!prev29.regs?.length === !!area29.regs?.length;
          area29.changedAt = comparable && prev29!.hash !== area29.hash ? now : comparable ? prev29!.changedAt : undefined;
          await writeJson('area29.json', area29);
          a29 = { updated: true, modified: area29.sourceModified, status: area29.status };
          console.log(`[salmon] Area 29 re-processed: status ${area29.status}, ${area29.rows.length} salmon rows`);
        }
        validators[AREA29_URL] = p29.validators;
      } catch (err) {
        a29 = { error: err instanceof Error ? err.message : String(err) };
        console.error('[salmon] Area 29 check failed:', a29.error);
      }

      await writeJson('http-validators.json', validators);
      await logAttempt('regulations', true);
      return { region2: r2, area29: a29 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[salmon] Regulation check failed:', msg);
      await logAttempt('regulations', false, msg);
      throw err;
    } finally {
      g.__salmonRefreshing = undefined;
    }
  })();
  return g.__salmonRefreshing;
}
