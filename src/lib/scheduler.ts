import cron from 'node-cron';
import { refreshRegulations } from './refresh';
import { ensureRivers } from './rivers';
import { ensureSubareas } from './subareas';
import { ensureRiverAreas } from './riverAreas';
import { readJson } from './store';
import type { Region2Data } from './types';

/**
 * Daily DFO check + one-time river download.
 * FETCH_CRON (default "0 6 * * *") runs in the TZ timezone (default America/Vancouver).
 */
export function startScheduler() {
  const g = globalThis as unknown as { __salmonScheduler?: boolean };
  if (g.__salmonScheduler) return;
  g.__salmonScheduler = true;

  const expr = process.env.FETCH_CRON || '0 6 * * *';
  const timezone = process.env.TZ || 'America/Vancouver';
  if (!cron.validate(expr)) {
    console.error(`[salmon] FETCH_CRON "${expr}" is not a valid cron expression; daily refresh disabled`);
  } else {
    cron.schedule(expr, () => void refreshRegulations().catch(() => {}), { timezone, name: 'dfo-daily' });
    console.log(`[salmon] DFO regulations will refresh on "${expr}" (${timezone})`);
  }

  // On boot: fetch now if we have no data or it's older than 20 hours; download rivers if we never have.
  setTimeout(async () => {
    const r2 = await readJson<Region2Data>('region2.json');
    const age = r2 ? Date.now() - Date.parse(r2.checkedAt ?? r2.fetchedAt) : Infinity;
    if (age > 20 * 3600 * 1000) {
      // the network isn't always ready the moment the container starts: retry after 1, 5 and 15 minutes
      for (const waitMin of [0, 1, 5, 15]) {
        if (waitMin) await new Promise((r) => setTimeout(r, waitMin * 60_000));
        const ok = await refreshRegulations().then(() => true, () => false);
        if (ok) break;
      }
    }
    await ensureRivers();
    await ensureSubareas();
    await ensureRiverAreas();
  }, 3000);
}
