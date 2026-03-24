import { getLiveOutagesResponse } from '@/lib/live-dashboard-server';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json(await getLiveOutagesResponse(), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
