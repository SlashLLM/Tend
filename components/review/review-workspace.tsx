'use client';
import { AlertTriangle, Check, Loader2, Pencil, Plus, RefreshCw, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AiLabel } from '@/components/tend/ai-label';
import { EvidenceChip } from '@/components/tend/evidence-chip';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { cn } from '@/lib/utils';
import { isPossible, formatMs } from '@/lib/levels';
import { MAX_WORDS, words } from '@/lib/pipeline/citations';
import { rewrite, toneFlags } from '@/lib/pipeline/tone';
import type { NarrativeContent, Sentence } from '@/lib/pipeline/types';
import { addTag, approveAndShare, beginReview, regenerate, reviewTag, setAside } from '@/app/actions/review';

export type ReviewUnit = { id: string; idx: number; text: string; start_ms: number; end_ms: number; photos: string[]; audioId: string | null };
export type ReviewTag = { id: string; unitId: string | null; code: string; name: string; level: number; valence: 'glow' | 'grow'; confidence: number; state: string; source: string; reason: string | null };
export type ReviewCard = { id: string; title: string; body: Record<string, string> };

type Props = {
  obsId: string;
  status: string;
  educatorName: string;
  reviewerName: string;
  units: ReviewUnit[];
  tags: ReviewTag[];
  draft: NarrativeContent;
  cards: ReviewCard[];
  indicators: { id: string; code: string; name: string }[];
  goals: { id: string; code: string; name: string }[];
  peers: { code: string; name: string; peer: string }[];
  mode: string;
};

type Section = 'glows' | 'grows';

/** Review (PRD §10): evidence beside the draft, every sentence linked; approve in ~3 minutes. */
export function ReviewWorkspace(p: Props) {
  const router = useRouter();
  const [content, setContent] = useState<NarrativeContent>(p.draft);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [addFor, setAddFor] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Active review time: counts while the tab is visible and the leader interacted in the last 60 s.
  const active = useRef(0);
  const lastInput = useRef(Date.now());
  useEffect(() => {
    if (p.status === 'ai_draft') void beginReview(p.obsId);
    const bump = () => (lastInput.current = Date.now());
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput.current < 60_000) active.current += 1000;
    }, 1000);
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    return () => { clearInterval(id); window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); };
  }, [p.obsId, p.status]);

  const unitById = useMemo(() => new Map(p.units.map((u) => [u.id, u])), [p.units]);
  const total = words([...content.glows, ...content.grows, content.next_step].map((s) => s.text).join(' '));
  const allSentences = [...content.glows, ...content.grows, content.next_step];
  const flagged = allSentences.filter((s) => toneFlags(s.text).length > 0).length;
  const uncited = allSentences.filter((s) => s.text.trim() && s.evidence_ids.filter((id) => unitById.has(id)).length === 0).length;

  const seek = (unitId: string) => {
    const u = unitById.get(unitId);
    setHighlight(unitId);
    document.getElementById(`unit-${unitId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (u?.audioId && audioRef.current) {
      audioRef.current.src = `/api/media/${u.audioId}`;
      void audioRef.current.play().catch(() => {});
    }
  };

  const setSentence = (section: Section | 'next', i: number, text: string) =>
    setContent((c) => (section === 'next' ? { ...c, next_step: { ...c.next_step, text } } : { ...c, [section]: c[section].map((s, k) => (k === i ? { ...s, text } : s)) }));
  const removeSentence = (section: Section, i: number) => setContent((c) => ({ ...c, [section]: c[section].filter((_, k) => k !== i) }));
  const addSentence = (section: Section, unitId: string) =>
    setContent((c) => ({ ...c, [section]: [...c[section], { text: '', evidence_ids: [unitId] }] }));

  const act = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong');
      }
    });

  const approve = () =>
    start(async () => {
      try {
        const res = await approveAndShare({
          obsId: p.obsId,
          content,
          activeMs: active.current,
          corrections: Object.entries(corrections).map(([unitId, text]) => ({ unitId, text })),
          dismissedCards: dismissed,
        });
        toast.success(`Shared with ${p.educatorName.split(' ')[0]} · ${Math.round(res.editRatio * 100)}% edited`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not share');
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Evidence ── */}
      <section aria-labelledby="evidence-h" className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="evidence-h" className="whitespace-nowrap text-base font-semibold">Evidence <span className="text-sm font-normal text-muted-foreground">{p.units.length} moments</span></h2>
          <audio ref={audioRef} controls className="h-8 max-w-[14rem]" aria-label="Replay audio" />
        </div>
        {p.units.length === 0 && <p className="tend-card p-4 text-sm text-muted-foreground">No evidence was captured.</p>}
        <ol className="grid gap-3">
          {p.units.map((u) => {
            const unitTags = p.tags.filter((t) => t.unitId === u.id && t.state !== 'rejected');
            const text = corrections[u.id] ?? u.text;
            return (
              <li key={u.id} id={`unit-${u.id}`} className={cn('tend-card grid gap-2 p-4 transition-shadow', highlight === u.id && 'ring-2 ring-primary')}>
                <div className="flex items-center justify-between gap-2">
                  <EvidenceChip ms={u.start_ms} onSeek={() => seek(u.id)} />
                  <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setEditingUnit(editingUnit === u.id ? null : u.id)} aria-label="Correct transcript">
                    <Pencil className="size-4" aria-hidden /> Correct
                  </Button>
                </div>
                {editingUnit === u.id ? (
                  <Textarea aria-label="Corrected transcript" value={text} onChange={(e) => setCorrections((c) => ({ ...c, [u.id]: e.target.value }))} />
                ) : (
                  <p className="text-sm leading-relaxed">{text}</p>
                )}
                {u.photos.length > 0 && (
                  <div className="flex gap-2">
                    {u.photos.map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ph} src={`/api/media/${ph}`} alt="Classroom photo (faces blurred)" className="h-20 w-28 rounded-md object-cover" />
                    ))}
                  </div>
                )}
                <ul className="grid gap-2" aria-label="Tags">
                  {unitTags.map((t) => (
                    <TagRow key={t.id} t={t} disabled={pending} onAct={(a, l) => act(() => reviewTag(t.id, a, l))} />
                  ))}
                </ul>
                {addFor === u.id ? (
                  <AddTagForm indicators={p.indicators} onCancel={() => setAddFor(null)} onAdd={(ind, level, valence) => act(async () => { await addTag(p.obsId, ind, level, valence, u.id); setAddFor(null); }, 'Tag added')} />
                ) : (
                  <Button variant="ghost" size="sm" className="min-h-11 justify-self-start" onClick={() => setAddFor(u.id)}><Plus className="size-4" aria-hidden /> Add tag</Button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Draft ── */}
      <section aria-labelledby="draft-h" className="grid content-start gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="draft-h" className="text-base font-semibold">Growth notes for {p.educatorName.split(' ')[0]}</h2>
          <span className={cn('text-sm tabular-nums', total > MAX_WORDS ? 'text-destructive' : 'text-muted-foreground')}>{total}/{MAX_WORDS} words</span>
        </div>
        <AiLabel reviewer={null} />
        {p.mode === 'offline' && <p className="-mt-2 text-xs text-muted-foreground">Drafted offline (rule-based). Add an AI key for richer drafts.</p>}

        {(['glows', 'grows'] as const).map((section) => (
          <div key={section} className="grid gap-2">
            <h3 className="text-sm font-semibold">{section === 'glows' ? 'Glows' : 'Grows'} <span className="font-normal text-muted-foreground">{section === 'glows' ? 'what went well · up to 3' : 'opportunities · up to 2'}</span></h3>
            {content[section].map((s, i) => (
              <SentenceEditor key={`${section}-${i}`} kind={section === 'glows' ? 'glow' : 'grow'} s={s} unitById={unitById} onSeek={seek}
                onChange={(t) => setSentence(section, i, t)} onRemove={() => removeSentence(section, i)} />
            ))}
            {content[section].length < (section === 'glows' ? 3 : 2) && p.units[0] && (
              <Button variant="ghost" size="sm" className="min-h-11 justify-self-start" onClick={() => addSentence(section, highlight ?? p.units[0].id)}>
                <Plus className="size-4" aria-hidden /> Add a {section === 'glows' ? 'Glow' : 'Grow'} {highlight ? `(cites ${formatMs(unitById.get(highlight)?.start_ms ?? 0)})` : ''}
              </Button>
            )}
          </div>
        ))}
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Next step <span className="font-normal text-muted-foreground">one step {p.educatorName.split(' ')[0]} owns</span></h3>
          <SentenceEditor kind="next" s={content.next_step} unitById={unitById} onSeek={seek} onChange={(t) => setSentence('next', 0, t)} />
          <label className="grid gap-1 text-sm">
            Links to goal
            <select className="min-h-11 w-full rounded-md border bg-card px-2" value={content.next_step.goal_id ?? ''} onChange={(e) => setContent((c) => ({ ...c, next_step: { ...c.next_step, goal_id: e.target.value || null } }))}>
              <option value="">—</option>
              {p.goals.map((g) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
            </select>
          </label>
        </div>

        {p.cards.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Coaching cards</h3>
            {p.cards.map((c) => {
              const off = dismissed.includes(c.id);
              return (
                <label key={c.id} className={cn('tend-card flex items-start gap-3 p-3 text-sm', off && 'opacity-50')}>
                  <input type="checkbox" className="mt-1 size-4" checked={!off} onChange={() => setDismissed((d) => (off ? d.filter((x) => x !== c.id) : [...d, c.id]))} />
                  <span><span className="font-medium">{c.title}</span><br /><span className="text-muted-foreground">Try tomorrow: {c.body.try_tomorrow}</span></span>
                </label>
              );
            })}
          </div>
        )}

        {p.peers.length > 0 && (
          <div className="tend-card flex items-start gap-3 p-3 text-sm">
            <Sparkles className="mt-0.5 size-4 text-amber" aria-hidden />
            <span>Peer Match: {p.peers.map((x) => `${x.peer} (strong at ${x.code})`).join(', ')} — offered to {p.educatorName.split(' ')[0]} with the notes.</span>
          </div>
        )}

        <div className="sticky bottom-16 z-20 grid gap-2 border-t bg-background/95 pb-2 pt-3 backdrop-blur md:bottom-0">
          {(flagged > 0 || uncited > 0) && (
            <p className="flex items-center gap-2 text-sm text-amber" role="status">
              <AlertTriangle className="size-4" aria-hidden />
              {flagged > 0 && `${flagged} sentence${flagged === 1 ? '' : 's'} need gentler wording. `}
              {uncited > 0 && `${uncited} sentence${uncited === 1 ? '' : 's'} need evidence.`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11 flex-1" disabled={pending || flagged > 0 || uncited > 0 || total > MAX_WORDS || !content.next_step.text.trim()} onClick={approve}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Approve &amp; share with {p.educatorName.split(' ')[0]}
            </Button>
            <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => act(() => regenerate(p.obsId), 'Regenerating…')}><RefreshCw aria-hidden /> Regenerate</Button>
            <Button variant="ghost" className="min-h-11" disabled={pending} onClick={() => act(() => setAside(p.obsId), 'Set aside')}>Set aside</Button>
          </div>
          <p className="text-xs text-muted-foreground">Nothing reaches {p.educatorName.split(' ')[0]} until you approve. It will be labelled “Drafted with AI · reviewed by {p.reviewerName}”.</p>
        </div>
      </section>
    </div>
  );
}

function SentenceEditor({ kind, s, unitById, onSeek, onChange, onRemove }: {
  kind: 'glow' | 'grow' | 'next'; s: Sentence; unitById: Map<string, ReviewUnit>; onSeek: (id: string) => void; onChange: (t: string) => void; onRemove?: () => void;
}) {
  const flags = toneFlags(s.text);
  const ring = kind === 'glow' ? 'border-l-success' : kind === 'grow' ? 'border-l-amber' : 'border-l-primary';
  return (
    <div className={cn('tend-card grid gap-2 border-l-4 p-3', ring)}>
      <Textarea aria-label={`${kind} sentence`} value={s.text} onChange={(e) => onChange(e.target.value)} className="min-h-16 border-0 p-0 shadow-none focus-visible:ring-0" />
      {flags.length > 0 && (
        <div className="grid gap-2 rounded-md bg-amber/10 px-2 py-2 text-sm" role="note">
          <p className="flex items-start gap-2"><Wand2 className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden /><span>Tone Guard: “{flags[0].word}” can feel judgemental.</span></p>
          <Button size="sm" variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left" onClick={() => onChange(rewrite(s.text))}>
            Use: “{rewrite(s.text).slice(0, 48)}{rewrite(s.text).length > 48 ? '…' : ''}”
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {s.evidence_ids.filter((id) => unitById.has(id)).map((id) => <EvidenceChip key={id} ms={unitById.get(id)!.start_ms} onSeek={() => onSeek(id)} className="min-h-9" />)}
        {onRemove && <Button variant="ghost" size="icon" className="ml-auto size-9" aria-label="Remove sentence" onClick={onRemove}><Trash2 className="size-4" aria-hidden /></Button>}
      </div>
    </div>
  );
}

function TagRow({ t, disabled, onAct }: { t: ReviewTag; disabled: boolean; onAct: (a: 'accept' | 'reject' | 'change_level', level?: number) => void }) {
  const possible = t.source === 'ai' && isPossible(t.confidence);
  const accepted = t.state === 'accepted';
  return (
    <li className="flex flex-wrap items-center gap-2">
      <IndicatorTag code={t.code} name={t.name} level={t.level} valence={t.valence} confidence={t.source === 'ai' ? t.confidence : null} />
      <span className="text-xs text-muted-foreground">{t.valence === 'glow' ? 'Glow' : 'Grow'}{accepted ? ' · accepted' : possible ? ' · unticked' : ''}</span>
      <span className="ml-auto flex gap-1">
        {!accepted && <Button size="icon" variant="outline" className="size-9" disabled={disabled} aria-label={`Accept ${t.code}`} onClick={() => onAct('accept')}><Check className="size-4" aria-hidden /></Button>}
        <select aria-label={`Level for ${t.code}`} className="h-9 rounded-md border bg-card px-1 text-sm" value={t.level} disabled={disabled} onChange={(e) => onAct('change_level', Number(e.target.value))}>
          {[1, 2, 3].map((l) => <option key={l} value={l}>L{l}</option>)}
        </select>
        <Button size="icon" variant="ghost" className="size-9" disabled={disabled} aria-label={`Remove ${t.code}`} onClick={() => onAct('reject')}><X className="size-4" aria-hidden /></Button>
      </span>
    </li>
  );
}

function AddTagForm({ indicators, onAdd, onCancel }: { indicators: { id: string; code: string; name: string }[]; onAdd: (id: string, level: number, v: 'glow' | 'grow') => void; onCancel: () => void }) {
  const [ind, setInd] = useState('');
  const [level, setLevel] = useState(2);
  const [valence, setValence] = useState<'glow' | 'grow'>('glow');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-2">
      <select aria-label="Indicator" className="min-h-11 min-w-0 flex-1 rounded-md border bg-card px-2 text-sm" value={ind} onChange={(e) => setInd(e.target.value)}>
        <option value="">Indicator…</option>
        {indicators.map((i) => <option key={i.id} value={i.id}>{i.code} {i.name}</option>)}
      </select>
      <select aria-label="Level" className="min-h-11 rounded-md border bg-card px-2 text-sm" value={level} onChange={(e) => setLevel(Number(e.target.value))}>{[1, 2, 3].map((l) => <option key={l} value={l}>L{l}</option>)}</select>
      <select aria-label="Glow or Grow" className="min-h-11 rounded-md border bg-card px-2 text-sm" value={valence} onChange={(e) => setValence(e.target.value as 'glow' | 'grow')}><option value="glow">Glow</option><option value="grow">Grow</option></select>
      <Button size="sm" className="min-h-11" disabled={!ind} onClick={() => onAdd(ind, level, valence)}>Add</Button>
      <Button size="sm" variant="ghost" className="min-h-11" onClick={onCancel}>Cancel</Button>
    </div>
  );
}
