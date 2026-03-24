import { getLivePricesResponse } from '@/lib/live-dashboard-edge';

export const runtime = 'edge';

export async function GET(request: Request) {
  return Response.json(await getLivePricesResponse(request.url), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
