'use client';
import { ArrowLeft, ArrowRight, Footprints, Loader2, PenLine, ShieldCheck, Sprout, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { completeOnboarding } from '@/app/actions/onboarding';
import { savePreferences } from '@/app/actions/admin';
import { LOCALE_META, LOCALES, type Locale } from '@/i18n/routing';
import { ONBOARDING_STEPS } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

const SLIDES = [
  { key: 'growth', Icon: Sprout },
  { key: 'focus', Icon: Target },
  { key: 'reflect', Icon: PenLine },
  { key: 'next', Icon: Footprints },
] as const;

const localePath = (l: Locale, path: string) => (l === 'en' ? path : `/${l}${path}`);

export function OnboardingFlow(p: { start: number; returning: boolean; locale: Locale; textScale: number; firstName: string; role: string; centreName: string | null }) {
  const t = useTranslations('onboarding');
  const [step, setStep] = useState(p.start);
  const [scale, setScale] = useState(p.textScale);
  const [slide, setSlide] = useState(0);
  const [ack, setAck] = useState(false);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const name = ONBOARDING_STEPS[step];

  // Move focus to each new step's heading so screen-reader and keyboard users follow along.
  useEffect(() => {
    if (step !== p.start) heading.current?.focus();
  }, [step, p.start]);

  // Preview the text size live; it is saved with the rest at the end.
  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(scale));
  }, [scale]);

  function chooseLanguage(l: Locale) {
    if (l === p.locale) return setStep(1);
    start(async () => {
      try {
        await savePreferences({ locale: l, textScale: scale });
      } catch {
        toast.error(t('saveFailed'));
        return;
      }
      window.location.assign(localePath(l, '/onboarding?step=1'));
    });
  }

  function finish() {
    start(async () => {
      try {
        const { next } = await completeOnboarding({ locale: p.locale, textScale: scale, acknowledged: true });
        window.location.assign(localePath(p.locale, next));
      } catch {
        toast.error(t('saveFailed'));
      }
    });
  }

  const back = step > 0 && !p.returning && (
    <Button type="button" variant="ghost" className="min-h-11" onClick={() => setStep(step - 1)}>
      <ArrowLeft aria-hidden /> {t('back')}
    </Button>
  );

  return (
    <section className="tend-card grid gap-6 p-6" aria-labelledby="ob-title">
      {!p.returning && (
        <div className="grid gap-2">
          <p className="tend-dateline">{t('stepOf', { n: step + 1, total: ONBOARDING_STEPS.length })}</p>
          <ol className="flex gap-1.5" aria-hidden>
            {ONBOARDING_STEPS.map((s, i) => (
              <li key={s} className={cn('h-1.5 flex-1 rounded-full bg-muted', i <= step && 'bg-primary')} />
            ))}
          </ol>
        </div>
      )}

      {name === 'language' && (
        <>
          <Header ref={heading} title={t('languageTitle', { name: p.firstName })} body={t('languageBody')} />
          <div className="grid gap-2">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                lang={LOCALE_META[l].htmlLang}
                disabled={pending}
                onClick={() => chooseLanguage(l)}
                aria-current={l === p.locale ? 'true' : undefined}
                className={cn('flex min-h-12 items-center justify-between rounded-lg border px-4 text-left text-lg hover:border-primary', l === p.locale && 'border-primary')}
              >
                {LOCALE_META[l].label}
                {l === p.locale && <ArrowRight className="size-4 text-primary" aria-hidden />}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{t('languageLater')}</p>
        </>
      )}

      {name === 'textSize' && (
        <>
          <Header ref={heading} title={t('sizeTitle')} body={t('sizeBody')} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('sizeTitle')}>
            {[100, 115, 130].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={scale === v}
                onClick={() => setScale(v)}
                className={cn('min-h-12 min-w-20 rounded-full border px-4', scale === v && 'border-primary bg-primary text-primary-foreground')}
                style={{ fontSize: `${v}%` }}
              >
                {v}%
              </button>
            ))}
          </div>
          <p className="rounded-lg bg-muted p-4">{t('sizeSample')}</p>
          <Nav back={back} next={<Button className="min-h-11" onClick={() => setStep(2)}>{t('continue')} <ArrowRight aria-hidden /></Button>} />
        </>
      )}

      {name === 'intro' && (
        <>
          <Header ref={heading} title={t('introTitle')} body={t('introBody')} />
          {(() => {
            const { key, Icon } = SLIDES[slide];
            return (
              <div key={key} className="grid gap-3 rounded-lg bg-muted p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" aria-live="polite">
                <Icon className="size-8 text-primary" aria-hidden />
                <h3 className="font-heading text-lg font-semibold">{t(`slides.${key}.title`)}</h3>
                <p>{t(`slides.${key}.body`)}</p>
                <p className="text-xs text-muted-foreground">{t('slideOf', { n: slide + 1, total: SLIDES.length })}</p>
              </div>
            );
          })()}
          <Nav
            back={slide > 0 ? <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSlide(slide - 1)}><ArrowLeft aria-hidden /> {t('back')}</Button> : back}
            next={
              <div className="flex flex-wrap justify-end gap-2">
                {slide < SLIDES.length - 1 && <Button variant="outline" className="min-h-11" onClick={() => setStep(3)}>{t('skipIntro')}</Button>}
                <Button className="min-h-11" onClick={() => (slide < SLIDES.length - 1 ? setSlide(slide + 1) : setStep(3))}>
                  {t('continue')} <ArrowRight aria-hidden />
                </Button>
              </div>
            }
          />
        </>
      )}

      {name === 'role' && (
        <>
          <Header ref={heading} title={t('roleTitle')} body={p.centreName ? t('roleBodyCentre', { role: p.role, centre: p.centreName }) : t('roleBody', { role: p.role })} />
          <p className="text-sm text-muted-foreground">{t('roleWrong')}</p>
          <Nav back={back} next={<Button className="min-h-11" onClick={() => setStep(4)}>{t('roleConfirm')} <ArrowRight aria-hidden /></Button>} />
        </>
      )}

      {name === 'notice' && (
        <>
          <Header ref={heading} title={t(p.returning ? 'noticeUpdatedTitle' : 'noticeTitle')} body={t('noticeBody')} icon={<ShieldCheck className="size-6 text-primary" aria-hidden />} />
          <ul className="grid list-disc gap-2 pl-5">
            {(['purpose', 'gate', 'private', 'access', 'children', 'storage'] as const).map((k) => (
              <li key={k}>{t(`notice.${k}`)}</li>
            ))}
          </ul>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3">
            <input type="checkbox" className="mt-1 size-5 accent-primary" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{t('noticeAck')}</span>
          </label>
          <Nav
            back={back}
            next={
              <Button className="min-h-11" disabled={!ack || pending} onClick={finish}>
                {pending && <Loader2 className="animate-spin" aria-hidden />} {t('finish')}
              </Button>
            }
          />
        </>
      )}
    </section>
  );
}

function Header({ ref, title, body, icon }: { ref: React.Ref<HTMLHeadingElement>; title: string; body: string; icon?: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      {icon}
      <h1 id="ob-title" ref={ref} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

function Nav({ back, next }: { back: React.ReactNode; next: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>{back}</div>
      {next}
    </div>
  );
}
