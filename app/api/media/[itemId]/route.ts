import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Short-lived signed URL for restricted media — only if the user can see the item under RLS (leaders/observers). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: item } = await supabase.from('capture_item').select('storage_path').eq('id', itemId).maybeSingle();
  if (!item?.storage_path) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await createAdminClient().storage.from('capture').createSignedUrl(item.storage_path, 300);
  if (error || !data) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
