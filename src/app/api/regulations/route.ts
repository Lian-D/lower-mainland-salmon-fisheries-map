import { getAppData } from '@/lib/appdata';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await getAppData(), { headers: { 'Cache-Control': 'no-store' } });
}
