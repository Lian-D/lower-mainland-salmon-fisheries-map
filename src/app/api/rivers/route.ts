import { getRiverGeometry } from '@/lib/rivers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const geo = await getRiverGeometry();
  if (!geo.ready) return Response.json(geo, { headers: { 'Cache-Control': 'no-store' } });
  const etag = `"${geo.version}"`;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return Response.json(geo, { headers: { ETag: etag, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } });
}
