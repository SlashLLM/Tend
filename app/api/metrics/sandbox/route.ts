import { NextResponse, type NextRequest } from 'next/server';
import { tiles, toCsv, type RawMetrics } from '@/lib/metrics';
import { createClient } from '@/lib/supabase/server';

/** GET /api/metrics/sandbox?centre=…&format=json|csv — scoped by the caller's role inside sandbox_metrics(). */
export async function GET(req: NextRequest) {
  const centre = req.nextUrl.searchParams.get('centre');
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sandbox_metrics', { p_centre: centre || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  if (format === 'json') return NextResponse.json(data);
  const csv = toCsv(tiles(data as RawMetrics), { scope: centre ? `centre ${centre}` : 'network', generatedAt: new Date().toISOString() });
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="tend-sandbox-metrics.csv"`, 'Cache-Control': 'no-store' } });
}
