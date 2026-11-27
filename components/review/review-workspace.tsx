'use client';
import { AlertTriangle, Check, Loader2, Pencil, Plus, RefreshCw, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

export type ReviewUnit = { id: string; idx: number; text: string; start_ms: number; end_ms: number; photos: string[]; videos?: string[]; audioId: string | null };
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
  const t = useTranslations('workspace');
  const first = p.educatorName.split(' ')[0];
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
        console.error(e);
        toast.error(t('error'));
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
        toast.success(t('shared', { name: first, pct: Math.round(res.editRatio * 100) }));
        router.refresh();
      } catch (e) {
        console.error(e);
        toast.error(t('shareFailed'));
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Evidence ── */}
      <section aria-labelledby="evidence-h" className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="evidence-h" className="whitespace-nowrap text-base font-semibold">{t('evidence')} <span className="text-sm font-normal text-muted-foreground">{t('moments', { n: p.units.length })}</span></h2>
          <audio ref={audioRef} controls className="h-8 max-w-[14rem]" aria-label={t('replayAudio')} />
        </div>
        {p.units.length === 0 && <p className="tend-card p-4 text-sm text-muted-foreground">{t('noEvidence')}</p>}
        <ol className="grid gap-3">
          {p.units.map((u) => {
            const unitTags = p.tags.filter((x) => x.unitId === u.id && x.state !== 'rejected');
            const text = corrections[u.id] ?? u.text;
            return (
              <li key={u.id} id={`unit-${u.id}`} className={cn('tend-card grid gap-2 p-4 transition-shadow', highlight === u.id && 'ring-2 ring-primary')}>
                <div className="flex items-center justify-between gap-2">
                  <EvidenceChip ms={u.start_ms} onSeek={() => seek(u.id)} />
                  <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setEditingUnit(editingUnit === u.id ? null : u.id)} aria-label={t('correctTranscript')}>
                    <Pencil className="size-4" aria-hidden /> {t('correct')}
                  </Button>
                </div>
                {editingUnit === u.id ? (
                  <Textarea aria-label={t('correctedTranscript')} value={text} onChange={(e) => setCorrections((c) => ({ ...c, [u.id]: e.target.value }))} />
                ) : (
                  <p className="text-sm leading-relaxed">{text}</p>
                )}
                {(u.photos.length > 0 || (u.videos?.length ?? 0) > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {u.photos.map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ph} src={`/api/media/${ph}`} alt={t('photoAlt')} className="h-20 w-28 rounded-md object-cover" />
                    ))}
                    {(u.videos ?? []).map((v) => (
                      <video key={v} src={`/api/media/${v}`} controls muted playsInline preload="metadata" aria-label={t('videoAlt')} className="h-20 w-36 rounded-md bg-muted object-cover" />
                    ))}
                  </div>
                )}
                <ul className="grid gap-2" aria-label={t('tags')}>
                  {unitTags.map((tag) => (
                    <TagRow key={tag.id} t={tag} disabled={pending} onAct={(a, l) => act(() => reviewTag(tag.id, a, l))} />
                  ))}
                </ul>
                {addFor === u.id ? (
                  <AddTagForm indicators={p.indicators} onCancel={() => setAddFor(null)} onAdd={(ind, level, valence) => act(async () => { await addTag(p.obsId, ind, level, valence, u.id); setAddFor(null); }, t('tagAdded'))} />
                ) : (
                  <Button variant="ghost" size="sm" className="min-h-11 justify-self-start" onClick={() => setAddFor(u.id)}><Plus className="size-4" aria-hidden /> {t('addTag')}</Button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Draft ── */}
      <section aria-labelledby="draft-h" className="grid content-start gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="draft-h" className="text-base font-semibold">{t('notesFor', { name: first })}</h2>
          <span className={cn('text-sm tabular-nums', total > MAX_WORDS ? 'text-destructive' : 'text-muted-foreground')}>{t('words', { n: total, max: MAX_WORDS })}</span>
        </div>
        <AiLabel reviewer={null} />
        {p.mode === 'offline' && <p className="-mt-2 text-xs text-muted-foreground">{t('offline')}</p>}

        {(['glows', 'grows'] as const).map((section) => (
          <div key={section} className="grid gap-2">
            <h3 className="text-sm font-semibold">{section === 'glows' ? t('glows') : t('grows')} <span className="font-normal text-muted-foreground">{section === 'glows' ? t('glowsHint') : t('growsHint')}</span></h3>
            {content[section].map((s, i) => (
              <SentenceEditor key={`${section}-${i}`} kind={section === 'glows' ? 'glow' : 'grow'} s={s} unitById={unitById} onSeek={seek}
                onChange={(v) => setSentence(section, i, v)} onRemove={() => removeSentence(section, i)} />
            ))}
            {content[section].length < (section === 'glows' ? 3 : 2) && p.units[0] && (
              <Button variant="ghost" size="sm" className="min-h-11 justify-self-start" onClick={() => addSentence(section, highlight ?? p.units[0].id)}>
                <Plus className="size-4" aria-hidden /> {section === 'glows' ? t('addGlow') : t('addGrow')} {highlight ? t('cites', { time: formatMs(unitById.get(highlight)?.start_ms ?? 0) }) : ''}
              </Button>
            )}
          </div>
        ))}
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">{t('nextStep')} <span className="font-normal text-muted-foreground">{t('nextHint', { name: first })}</span></h3>
          <SentenceEditor kind="next" s={content.next_step} unitById={unitById} onSeek={seek} onChange={(v) => setSentence('next', 0, v)} />
          <label className="grid gap-1 text-sm">
            {t('linksToGoal')}
            <select className="min-h-11 w-full rounded-md border bg-card px-2" value={content.next_step.goal_id ?? ''} onChange={(e) => setContent((c) => ({ ...c, next_step: { ...c.next_step, goal_id: e.target.value || null } }))}>
              <option value="">—</option>
              {p.goals.map((g) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
            </select>
          </label>
        </div>

        {p.cards.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t('cards')}</h3>
            {p.cards.map((c) => {
              const off = dismissed.includes(c.id);
              return (
                <label key={c.id} className={cn('tend-card flex items-start gap-3 p-3 text-sm', off && 'opacity-50')}>
                  <input type="checkbox" className="mt-1 size-4" checked={!off} onChange={() => setDismissed((d) => (off ? d.filter((x) => x !== c.id) : [...d, c.id]))} />
                  <span><span className="font-medium">{c.title}</span><br /><span className="text-muted-foreground">{t('tryTomorrow', { text: c.body.try_tomorrow })}</span></span>
                </label>
              );
            })}
          </div>
        )}

        {p.peers.length > 0 && (
          <div className="tend-card flex items-start gap-3 p-3 text-sm">
            <Sparkles className="mt-0.5 size-4 text-amber" aria-hidden />
            <span>{t('peerMatch', { list: p.peers.map((x) => t('strongAt', { peer: x.peer, code: x.code })).join(', '), name: first })}</span>
          </div>
        )}

        <div className="sticky bottom-16 z-20 grid gap-2 border-t bg-background/95 pb-2 pt-3 backdrop-blur md:bottom-0">
          {(flagged > 0 || uncited > 0) && (
            <p className="flex items-center gap-2 text-sm text-amber" role="status">
              <AlertTriangle className="size-4" aria-hidden />
              {flagged > 0 && t('needWording', { n: flagged })}
              {uncited > 0 && t('needEvidence', { n: uncited })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11 flex-1" disabled={pending || flagged > 0 || uncited > 0 || total > MAX_WORDS || !content.next_step.text.trim()} onClick={approve}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} {t('approve', { name: first })}
            </Button>
            <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => act(() => regenerate(p.obsId), t('regenerating'))}><RefreshCw aria-hidden /> {t('regenerate')}</Button>
            <Button variant="ghost" className="min-h-11" disabled={pending} onClick={() => act(() => setAside(p.obsId), t('setAsideDone'))}>{t('setAside')}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('nothingReaches', { name: first, reviewer: p.reviewerName })}</p>
        </div>
      </section>
    </div>
  );
}

function SentenceEditor({ kind, s, unitById, onSeek, onChange, onRemove }: {
  kind: 'glow' | 'grow' | 'next'; s: Sentence; unitById: Map<string, ReviewUnit>; onSeek: (id: string) => void; onChange: (t: string) => void; onRemove?: () => void;
}) {
  const t = useTranslations('workspace');
  const flags = toneFlags(s.text);
  const ring = kind === 'glow' ? 'border-l-success' : kind === 'grow' ? 'border-l-amber' : 'border-l-primary';
  return (
    <div className={cn('tend-card grid gap-2 border-l-4 p-3', ring)}>
      <Textarea aria-label={t('sentence', { kind: t(kind) })} value={s.text} onChange={(e) => onChange(e.target.value)} className="min-h-16 border-0 p-0 shadow-none focus-visible:ring-0" />
      {flags.length > 0 && (
        <div className="grid gap-2 rounded-md bg-amber/10 px-2 py-2 text-sm" role="note">
          <p className="flex items-start gap-2"><Wand2 className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden /><span>{t('toneGuard', { word: flags[0].word })}</span></p>
          <Button size="sm" variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left" onClick={() => onChange(rewrite(s.text))}>
            {t('use', { text: `${rewrite(s.text).slice(0, 48)}${rewrite(s.text).length > 48 ? '…' : ''}` })}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {s.evidence_ids.filter((id) => unitById.has(id)).map((id) => <EvidenceChip key={id} ms={unitById.get(id)!.start_ms} onSeek={() => onSeek(id)} className="min-h-9" />)}
        {onRemove && <Button variant="ghost" size="icon" className="ml-auto size-9" aria-label={t('removeSentence')} onClick={onRemove}><Trash2 className="size-4" aria-hidden /></Button>}
      </div>
    </div>
  );
}

function TagRow({ t, disabled, onAct }: { t: ReviewTag; disabled: boolean; onAct: (a: 'accept' | 'reject' | 'change_level', level?: number) => void }) {
  const tr = useTranslations('workspace');
  const possible = t.source === 'ai' && isPossible(t.confidence);
  const accepted = t.state === 'accepted';
  return (
    <li className="flex flex-wrap items-center gap-2">
      <IndicatorTag code={t.code} name={t.name} level={t.level} valence={t.valence} confidence={t.source === 'ai' ? t.confidence : null} />
      <span className="text-xs text-muted-foreground">{t.valence === 'glow' ? tr('glow') : tr('grow')}{accepted ? tr('accepted') : possible ? tr('unticked') : ''}</span>
      <span className="ml-auto flex gap-1">
        {!accepted && <Button size="icon" variant="outline" className="size-9" disabled={disabled} aria-label={tr('acceptTag', { code: t.code })} onClick={() => onAct('accept')}><Check className="size-4" aria-hidden /></Button>}
        <select aria-label={tr('levelFor', { code: t.code })} className="h-9 rounded-md border bg-card px-1 text-sm" value={t.level} disabled={disabled} onChange={(e) => onAct('change_level', Number(e.target.value))}>
          {[1, 2, 3].map((l) => <option key={l} value={l}>L{l}</option>)}
        </select>
        <Button size="icon" variant="ghost" className="size-9" disabled={disabled} aria-label={tr('removeTag', { code: t.code })} onClick={() => onAct('reject')}><X className="size-4" aria-hidden /></Button>
      </span>
    </li>
  );
}

function AddTagForm({ indicators, onAdd, onCancel }: { indicators: { id: string; code: string; name: string }[]; onAdd: (id: string, level: number, v: 'glow' | 'grow') => void; onCancel: () => void }) {
  const [ind, setInd] = useState('');
  const [level, setLevel] = useState(2);
  const [valence, setValence] = useState<'glow' | 'grow'>('glow');
  const t = useTranslations('workspace');
  const tc = useTranslations('common');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-2">
      <select aria-label={t('indicator')} className="min-h-11 min-w-0 flex-1 rounded-md border bg-card px-2 text-sm" value={ind} onChange={(e) => setInd(e.target.value)}>
        <option value="">{t('chooseIndicator')}</option>
        {indicators.map((i) => <option key={i.id} value={i.id}>{i.code} {i.name}</option>)}
      </select>
      <select aria-label={t('level')} className="min-h-11 rounded-md border bg-card px-2 text-sm" value={level} onChange={(e) => setLevel(Number(e.target.value))}>{[1, 2, 3].map((l) => <option key={l} value={l}>L{l}</option>)}</select>
      <select aria-label={t('glowOrGrow')} className="min-h-11 rounded-md border bg-card px-2 text-sm" value={valence} onChange={(e) => setValence(e.target.value as 'glow' | 'grow')}><option value="glow">{t('glow')}</option><option value="grow">{t('grow')}</option></select>
      <Button size="sm" className="min-h-11" disabled={!ind} onClick={() => onAdd(ind, level, valence)}>{t('add')}</Button>
      <Button size="sm" variant="ghost" className="min-h-11" onClick={onCancel}>{tc('cancel')}</Button>
    </div>
  );
}
