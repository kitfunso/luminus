import { getLivePricesResponse } from '@/lib/live-dashboard-server';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json(await getLivePricesResponse(), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
