'use client';
import { CheckCircle2, CircleDashed, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { LevelStones } from '@/components/tend/level-stones';
import { addAction, addGoal, confirmIdp, removeGoal, setGoalLevels } from '@/app/actions/idp';
import { ActionItem } from './action-item';
import type { IdpView } from '@/lib/data/growth';
import type { Level } from '@/lib/levels';

type Props = {
  plan: IdpView;
  viewer: 'educator' | 'leader';
  indicatorOptions: { code: string; name: string }[];
  educatorName: string;
};

/** IDP co-creation (PRD M3.2): educator and leader edit the same draft, then both confirm. */
export function IdpEditor({ plan, viewer, indicatorOptions, educatorName }: Props) {
  const [pending, start] = useTransition();
  const [newCode, setNewCode] = useState('');
  const [actionText, setActionText] = useState<Record<string, string>>({});
  const editable = plan.status === 'draft';
  const iConfirmed = viewer === 'educator' ? plan.educator_confirmed_at : plan.leader_confirmed_at;

  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong');
      }
    });

  const used = new Set(plan.goals.map((g) => g.indicator.code));

  return (
    <div className="grid gap-4">
      <ol className="grid gap-3">
        {plan.goals.map((g, i) => (
          <li key={g.id} className="tend-card grid gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-2">
                <p className="tend-dateline">Goal {i + 1}</p>
                <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="self-start" />
                {g.tsc && <p className="text-xs text-muted-foreground">Skill: {g.tsc.title}</p>}
              </div>
              {editable && (
                <Button variant="ghost" size="icon" className="size-11" aria-label={`Remove goal ${g.indicator.code}`} disabled={pending} onClick={() => run(() => removeGoal(g.id))}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">Now</p>
                {editable ? (
                  <LevelStones level={g.current_level} onSelect={(l: Level) => run(() => setGoalLevels(g.id, { current_level: l, target_level: Math.max(l, g.target_level) }))} />
                ) : (
                  <LevelStones level={g.current_level} size="sm" />
                )}
              </div>
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">Aim for</p>
                {editable ? (
                  <LevelStones level={g.target_level} onSelect={(l: Level) => run(() => setGoalLevels(g.id, { target_level: l }))} />
                ) : (
                  <LevelStones level={g.target_level} size="sm" />
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Actions</p>
              {g.actions.length === 0 && <p className="text-sm text-muted-foreground">No actions yet.</p>}
              <ul className="grid gap-3">
                {g.actions.map((a) => <ActionItem key={a.id} action={a} canAct={viewer === 'educator'} />)}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = actionText[g.id]?.trim();
                  if (!text) return;
                  run(async () => {
                    await addAction(g.id, text);
                    setActionText((s) => ({ ...s, [g.id]: '' }));
                  });
                }}
              >
                <Input aria-label={`New action for ${g.indicator.code}`} placeholder="Add an action…" className="min-h-11" value={actionText[g.id] ?? ''} onChange={(e) => setActionText((s) => ({ ...s, [g.id]: e.target.value }))} />
                <Button type="submit" variant="outline" className="min-h-11" disabled={pending}>Add</Button>
              </form>
            </div>
          </li>
        ))}
      </ol>

      {editable && plan.goals.length < 3 && (
        <div className="tend-card flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <label htmlFor="add-goal" className="text-sm font-medium">Add a goal</label>
          <select id="add-goal" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="min-h-11 flex-1 rounded-md border bg-card px-3 text-sm">
            <option value="">Choose an indicator…</option>
            {indicatorOptions.filter((o) => !used.has(o.code)).map((o) => (
              <option key={o.code} value={o.code}>{o.code} {o.name}</option>
            ))}
          </select>
          <Button className="min-h-11" variant="outline" disabled={!newCode || pending} onClick={() => run(async () => { await addGoal(plan.id, newCode); setNewCode(''); })}>
            <Plus aria-hidden /> Add
          </Button>
        </div>
      )}

      {editable && (
        <div className="tend-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1 text-sm">
            <ConfirmLine who={educatorName} at={plan.educator_confirmed_at} />
            <ConfirmLine who="Centre Leader" at={plan.leader_confirmed_at} />
          </div>
          <Button className="min-h-11" disabled={pending || !!iConfirmed || plan.goals.length === 0} onClick={() => run(() => confirmIdp(plan.id), 'Confirmed')}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
            {iConfirmed ? 'You have confirmed' : 'Confirm this plan'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ConfirmLine({ who, at }: { who: string; at: string | null }) {
  return (
    <p className="flex items-center gap-2">
      {at ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden />}
      <span>{who}</span>
      <span className="text-muted-foreground">{at ? 'confirmed' : 'not yet confirmed'}</span>
    </p>
  );
}
