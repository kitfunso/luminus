import { getLiveFlowsResponse } from '@/lib/live-dashboard-server';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json(await getLiveFlowsResponse(), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
