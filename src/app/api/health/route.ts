import { getLog, getRegion2, readJson } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [r2, log] = await Promise.all([getRegion2(), getLog()]);
  return Response.json({ ok: true, regulationsFetchedAt: r2.seed ? null : r2.fetchedAt, usingSeed: !!r2.seed, riverOutlines: (await readJson('river-areas.json')) ? 'downloaded' : 'not yet', log });
}
