import { refreshRegulations } from '@/lib/refresh';
import { ensureRivers } from '@/lib/rivers';
import { ensureSubareas } from '@/lib/subareas';
import { ensureRiverAreas } from '@/lib/riverAreas';

export const dynamic = 'force-dynamic';

/**
 * Manual refresh. Disabled unless REFRESH_TOKEN is set.
 *   curl -X POST -H "Authorization: Bearer $REFRESH_TOKEN" "http://host:3080/api/refresh?what=regs"
 *   what = regs (default, forces re-processing) | rivers (re-download river lines + subareas) | subareas | areas (river outlines) | all
 */
export async function POST(req: Request) {
  const token = process.env.REFRESH_TOKEN;
  if (!token) return Response.json({ error: 'Set REFRESH_TOKEN to enable manual refresh' }, { status: 403 });
  if (req.headers.get('authorization') !== `Bearer ${token}`) return Response.json({ error: 'Wrong token' }, { status: 401 });

  const what = new URL(req.url).searchParams.get('what') ?? 'regs';
  const out: Record<string, unknown> = {};
  try {
    if (what === 'regs' || what === 'all') {
      // manual refresh always re-processes, even if DFO's "Date modified" hasn't changed
      out.regulations = await refreshRegulations(true);
    }
    if (what === 'rivers' || what === 'all') {
      out.rivers = await ensureRivers(true);
      out.subareas = await ensureSubareas(true);
      out.riverAreas = await ensureRiverAreas(true);
    }
    if (what === 'areas') out.riverAreas = await ensureRiverAreas(true);
    if (what === 'subareas') out.subareas = await ensureSubareas(true);
    return Response.json({ ok: true, ...out });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
