'use client';
import { Camera, CloudOff, Loader2, Mic, PenLine, Play, Square, Star } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { blurFaces } from '@/lib/capture/blur';
import { deviceStart, elapsedSince } from '@/lib/capture/clock';
import { enqueue, flush, pending } from '@/lib/capture/queue';
import { segmentedRecorder, type RecorderLike, type SegmentedRecorder } from '@/lib/capture/recorder';
import { DEMO_DICTATION } from '@/lib/pipeline/demo-script';
import { startCapture } from '@/app/actions/observation';
import { formatMs } from '@/lib/levels';

type Line = { key: string; t: number; text: string; kind: 'note' | 'speech' | 'moment' | 'photo' };

const KIND_LABEL: Record<string, string> = { audio_chunk: 'voice clip', photo: 'photo', note: 'note', moment: 'moment', video: 'video' };

type Props = {
  obsId: string;
  initialStatus: 'scheduled' | 'capturing';
  /** How long ago capture started, per the server when it rendered the page (null: not started). */
  elapsedMs: number | null;
  demo: boolean;
  liveTranscription: boolean;
};

/** Live capture (PRD M4-B): eyes on the class, big thumb-zone controls, nothing lost offline. */
export function CaptureStudio({ obsId, initialStatus, elapsedMs, demo, liveTranscription }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<'ready' | 'capturing' | 'ending'>(initialStatus === 'capturing' ? 'capturing' : 'ready');
  // capture start on THIS device's clock (see lib/capture/clock.ts)
  const [t0, setT0] = useState<number | null>(() => (elapsedMs === null ? null : deviceStart(elapsedMs)));
  const [now, setNow] = useState(Date.now());
  const [recording, setRecording] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<SegmentedRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSeq = useRef(0);
  const flushing = useRef(false);
  const flushAgain = useRef(false);

  const elapsed = () => elapsedSince(t0);
  const nextSeq = () => {
    const s = Math.max(lastSeq.current + 1, Math.round(elapsed()));
    lastSeq.current = s;
    return s;
  };

  const sync = useCallback(async function run(): Promise<void> {
    // An item added while a flush is running must not wait for the 5 s retry, and the count shown
    // must not be overwritten by that flush's stale "0 left" ("All saved" while a photo is queued).
    if (flushing.current) {
      flushAgain.current = true;
      return;
    }
    flushing.current = true;
    flushAgain.current = false;
    try {
      const { left } = await flush(
        obsId,
        (u) => {
          if (u.transcript) setLines((l) => [...l, { key: u.key, t: Number(u.key.split(':')[2]), text: u.transcript!, kind: 'speech' }]);
        },
        (d) => toast.error(`A ${KIND_LABEL[d.kind] ?? 'capture item'} could not be saved (${d.error}). Please add it again.`, { duration: 10_000 }),
      );
      setQueued(left);
    } finally {
      flushing.current = false;
    }
    if (flushAgain.current) await run();
  }, [obsId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const retry = setInterval(() => void sync(), 5000);
    const on = () => { setOnline(true); void sync(); };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    void pending(obsId).then((p) => setQueued(p.length));
    return () => { clearInterval(tick); clearInterval(retry); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [obsId, sync]);

  async function add(kind: 'note' | 'moment' | 'photo' | 'audio_chunk', payload: { text?: string; blob?: Blob }, t = elapsed()) {
    const seq = nextSeq();
    await enqueue({ obsId, kind, seq, t, ...payload });
    setQueued((q) => q + 1);
    void sync();
    return seq;
  }

  async function begin() {
    setBusy(true);
    try {
      const { elapsedMs: since } = await startCapture(obsId);
      setT0(deviceStart(since));
      setStatus('capturing');
      navigator.vibrate?.(30);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start');
    } finally {
      setBusy(false);
    }
  }

  async function stopMic() {
    const seg = recRef.current;
    recRef.current = null;
    await seg?.stop(); // hands over the last clip
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }

  async function toggleMic() {
    if (recording) {
      setRecording(false);
      await stopMic();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      // 5-second, self-contained clips → live transcript within ~2 s of each clip (lib/capture/recorder.ts)
      const seg = segmentedRecorder({
        // MediaRecorder's handlers take a full BlobEvent; the recorder only reads `.data`
        create: () => new MediaRecorder(stream, mime ? { mimeType: mime } : undefined) as unknown as RecorderLike,
        segmentMs: 5000,
        now: elapsed,
        onClip: (blob, startMs) => void add('audio_chunk', { blob }, startMs),
      });
      seg.start();
      recRef.current = seg;
      streamRef.current = stream;
      setRecording(true);
      navigator.vibrate?.(20);
    } catch {
      toast.error('Microphone unavailable — type or use your keyboard’s dictation instead.');
    }
  }

  async function addNote() {
    const text = note.trim();
    if (!text) return;
    setNote('');
    const t = elapsed();
    await add('note', { text }, t);
    setLines((l) => [...l, { key: `n${t}`, t, text, kind: 'note' }]);
  }

  async function moment() {
    const t = elapsed();
    await add('moment', {}, t);
    setLines((l) => [...l, { key: `m${t}`, t, text: '★ Moment', kind: 'moment' }]);
    navigator.vibrate?.([15, 40, 15]);
  }

  async function photo(file: File | undefined) {
    if (!file) return;
    const t = elapsed();
    const { blob, faces, mode } = await blurFaces(file);
    await add('photo', { blob }, t);
    setLines((l) => [...l, { key: `p${t}`, t, text: mode === 'whole' ? 'Photo added (fully blurred)' : `Photo added · ${faces} face${faces === 1 ? '' : 's'} blurred`, kind: 'photo' }]);
  }

  async function playDemo() {
    for (const d of DEMO_DICTATION) {
      await add('note', { text: d.text }, d.t);
      setLines((l) => [...l, { key: `d${d.t}`, t: d.t, text: d.text, kind: 'note' }]);
      if (d.moment) await add('moment', {}, d.t + 1500);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async function end() {
    setStatus('ending');
    setRecording(false);
    await stopMic(); // waits for the last clip to be queued
    for (let i = 0; i < 5; i++) {
      await sync();
      if ((await pending(obsId)).length === 0) break;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
    if ((await pending(obsId)).length > 0) {
      toast.error('Some items are still waiting to sync. Keep this page open and try again when you have signal.');
      setStatus('capturing');
      return;
    }
    const res = await fetch(`/api/observations/${obsId}/end`, { method: 'POST' });
    if (!res.ok) {
      toast.error('Could not end the observation');
      setStatus('capturing');
      return;
    }
    router.push(`/reviews/${obsId}`);
  }

  if (status === 'ready') {
    return (
      <div className="grid place-items-center gap-4 py-8">
        <button onClick={begin} disabled={busy} aria-label="Start observation"
          className="grid size-24 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95">
          {busy ? <Loader2 className="size-9 animate-spin" aria-hidden /> : <Play className="size-10 fill-current" aria-hidden />}
        </button>
        <p className="text-sm text-muted-foreground">Start when you’re ready. Dictate quietly; type a note any time.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-48">
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono tabular-nums">{formatMs(elapsedSince(t0, now))}</span>
        <span className={cn('flex items-center gap-1.5', online ? 'text-muted-foreground' : 'text-amber')} aria-live="polite">
          {!online && <CloudOff className="size-4" aria-hidden />}
          {queued > 0 ? `${queued} waiting to sync` : online ? 'All saved' : 'Offline — saving on this device'}
        </span>
      </div>

      <section aria-label="Live transcript" className="tend-card min-h-56 p-4">
        {!liveTranscription && (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Audio is saved; live transcription starts when an AI key is added. Meanwhile, type or use your keyboard’s dictation.
          </p>
        )}
        <ol aria-live="polite" className="grid gap-2">
          {lines.length === 0 && <li className="text-sm text-muted-foreground">Your notes appear here.</li>}
          {lines.map((l) => (
            <li key={l.key} className={cn('flex gap-3 text-sm', l.kind === 'moment' && 'font-medium text-amber', l.kind === 'photo' && 'text-muted-foreground')}>
              <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatMs(l.t)}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
        {demo && lines.length === 0 && (
          <Button variant="outline" size="sm" className="mt-4 min-h-11" onClick={playDemo}>Play demo dictation (synthetic)</Button>
        )}
      </section>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addNote(); }}>
        <Input aria-label="Note" placeholder="Type or dictate a note…" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-12" />
        <Button type="submit" variant="outline" className="min-h-12" aria-label="Add note"><PenLine aria-hidden /></Button>
      </form>

      {/* thumb zone */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 px-4 pb-4 pt-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <label className="grid size-14 cursor-pointer place-items-center rounded-full border bg-card" aria-label="Add photo (faces are blurred on this device)">
            <Camera aria-hidden />
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void photo(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={toggleMic} aria-pressed={recording} aria-label={recording ? 'Pause dictation' : 'Record dictation'}
            className={cn('grid size-24 place-items-center rounded-full text-white shadow-lg transition-transform active:scale-95', recording ? 'tend-pulse bg-destructive' : 'bg-primary')}>
            {recording ? <Square className="size-9 fill-current" aria-hidden /> : <Mic className="size-10" aria-hidden />}
          </button>
          <button type="button" onClick={() => void moment()} aria-label="Mark a moment"
            className="grid size-14 place-items-center rounded-full bg-amber text-amber-foreground shadow active:scale-95">
            <Star className="fill-current" aria-hidden />
          </button>
        </div>
        <div className="mx-auto mt-3 max-w-xl">
          <Button onClick={() => void end()} disabled={status === 'ending'} variant="secondary" className="min-h-12 w-full">
            {status === 'ending' ? <><Loader2 className="animate-spin" aria-hidden /> Saving and drafting…</> : 'End observation'}
          </Button>
        </div>
      </div>
    </div>
  );
}
