import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aiMode } from '@/lib/ai/availability';
import { speechToText } from '@/lib/ai/stt';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const Meta = z.object({
  kind: z.enum(['audio_chunk', 'photo', 'note', 'moment', 'video']),
  seq: z.coerce.number().int().min(0).max(100_000_000),
  // Device and server clocks can disagree by a few seconds; a slightly negative offset means "at the start".
  t_offset_ms: z.coerce.number().int().min(-60_000).max(4 * 3600_000).transform((n) => Math.max(0, n)),
  text: z.string().max(4000).optional(),
});

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Upload one capture item (resumable: idempotent on observation+kind+seq).
 * Authorisation = the user's own RLS insert (leader/observer, status 'capturing').
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const form = await req.formData();
  const meta = Meta.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')));
  if (!meta.success) return NextResponse.json({ error: 'bad metadata' }, { status: 400 });
  const raw = form.get('file');
  if (raw && !(raw instanceof Blob)) return NextResponse.json({ error: 'bad file' }, { status: 400 });
  const file = raw instanceof Blob ? raw : null;
  if (file && file.size > MAX_BYTES) return NextResponse.json({ error: 'file too large' }, { status: 413 });
  if (['audio_chunk', 'photo', 'video'].includes(meta.data.kind) && !file) return NextResponse.json({ error: 'file required' }, { status: 400 });

  const supabase = await createClient();
  const { data: obs } = await supabase.from('observation').select('id, org_id, status').eq('id', id).maybeSingle();
  if (!obs) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // idempotency: same item already stored → return it
  const { data: existing } = await supabase.from('capture_item').select('id, transcript').eq('observation_id', id).eq('kind', meta.data.kind).eq('seq', meta.data.seq).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, transcript: existing.transcript, duplicate: true });

  const { data: item, error } = await supabase
    .from('capture_item')
    .insert({ org_id: obs.org_id, observation_id: id, kind: meta.data.kind, seq: meta.data.seq, t_offset_ms: meta.data.t_offset_ms, text: meta.data.text ?? null })
    .select('id')
    .single();
  if (error || !item) return NextResponse.json({ error: error?.message ?? 'not allowed' }, { status: 403 });

  let transcript: string | null = null;
  if (file) {
    const admin = createAdminClient();
    const ext = meta.data.kind === 'photo' ? 'jpg' : 'webm';
    const path = `${obs.org_id}/${id}/${meta.data.kind}-${meta.data.seq}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from('capture').upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (upErr) return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });
    await admin.from('capture_item').update({ storage_path: path }).eq('id', item.id);

    // Live transcript for audio chunks when an AI key is configured.
    if (meta.data.kind === 'audio_chunk' && aiMode() === 'luna') {
      try {
        transcript = await speechToText(bytes, { pass: 'live', signal: AbortSignal.timeout(10_000) });
        if (transcript) await admin.from('capture_item').update({ transcript }).eq('id', item.id);
      } catch (e) {
        // the clip is stored either way and the leader can still type notes — but make failures visible in the logs
        console.error(`capture: transcription failed for ${path}:`, e instanceof Error ? e.message : e);
        transcript = null;
      }
    }
  }
  return NextResponse.json({ id: item.id, transcript });
}
