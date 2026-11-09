import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { processObservation } from '@/lib/pipeline/store';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** End capture (RLS-checked RPC) and start the AI pipeline in the background. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const supabase = await createClient();
  const { data: obs } = await supabase.from('observation').select('status').eq('id', id).maybeSingle();
  if (!obs) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (obs.status === 'capturing') {
    const { error } = await supabase.rpc('end_capture', { p_obs: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  } else if (obs.status !== 'processing') {
    return NextResponse.json({ error: `cannot end from status ${obs.status}` }, { status: 409 });
  } else {
    // retry of a stuck/failed run: still requires the caller to be the leader/observer
    const { data: ok } = await supabase.rpc('can_lead_obs_public', { p_obs: id });
    if (!ok) return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  }
  after(async () => {
    await processObservation(createAdminClient(), id);
  });
  return NextResponse.json({ status: 'processing' }, { status: 202 });
}
