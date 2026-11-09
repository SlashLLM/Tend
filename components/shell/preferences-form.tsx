'use client';
import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { savePreferences } from '@/app/actions/admin';
import { cn } from '@/lib/utils';

export function PreferencesForm({ locale, textScale, peerMatch }: { locale: 'en' | 'zh'; textScale: number; peerMatch: boolean | null }) {
  const [l, setL] = useState(locale);
  const [s, setS] = useState(textScale);
  const [p, setP] = useState(peerMatch ?? false);
  const [pending, start] = useTransition();
  return (
    <form className="tend-card grid max-w-xl gap-6 p-6" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        await savePreferences({ locale: l, textScale: s, ...(peerMatch !== null ? { peerMatch: p } : {}) });
        toast.success('Saved');
        if (l !== locale) window.location.assign(l === 'en' ? window.location.pathname.replace(/^\/zh/, '') || '/' : `/zh${window.location.pathname.replace(/^\/zh/, '')}`);
        else window.location.reload();
      });
    }}>
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium">Language · 语言</legend>
        <div className="flex gap-2">
          {([['en', 'English'], ['zh', '中文']] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={l === v} onClick={() => setL(v)} className={cn('min-h-11 rounded-full border px-4', l === v && 'border-primary bg-primary text-primary-foreground')}>{label}</button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Bahasa Melayu and தமிழ் arrive in the pilot.</p>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium">Text size</legend>
        <div className="flex gap-2">
          {[100, 115, 130].map((v) => (
            <button key={v} type="button" aria-pressed={s === v} onClick={() => setS(v)} className={cn('min-h-11 rounded-full border px-4', s === v && 'border-primary bg-primary text-primary-foreground')} style={{ fontSize: `${v}%` }}>{v}%</button>
          ))}
        </div>
      </fieldset>
      {peerMatch !== null && (
        <label className="flex items-start gap-3">
          <Switch checked={p} onCheckedChange={setP} aria-label="Offer my strengths for Peer Match" className="mt-1" />
          <span><span className="font-medium">Offer my strengths for Peer Match</span><br /><span className="text-sm text-muted-foreground">Colleagues may be invited to watch you for 15 minutes in areas where you were seen at Level 3.</span></span>
        </label>
      )}
      <Button type="submit" className="min-h-11 justify-self-start" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden />} Save preferences</Button>
    </form>
  );
}
