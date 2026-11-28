'use client';
import { Lightbulb, PenLine } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { sgDate } from '@/lib/format';
import { LOCALE_META, toLocale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/** Sender colours from Tend's own palette; text uses the card colour so it holds contrast in both themes. */
const SENDER_FILLS = ['bg-primary', 'bg-d1-text', 'bg-d3-text', 'bg-d2-text'] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^(binte|bin|d\/o|s\/o)$/i.test(p));
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function fillFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SENDER_FILLS[h % SENDER_FILLS.length];
}

export type Sender = { kind: 'person'; name: string } | { kind: 'coach' } | { kind: 'you' };

function Avatar({ sender }: { sender: Sender }) {
  const base = 'grid size-11 shrink-0 place-items-center rounded-full font-heading text-sm font-bold text-card sm:size-12 sm:text-base';
  if (sender.kind === 'coach') return <span aria-hidden className={cn(base, 'bg-amber')}><Lightbulb className="size-5" /></span>;
  if (sender.kind === 'you') return <span aria-hidden className={cn(base, 'border-2 border-dashed border-input bg-transparent text-muted-foreground')}><PenLine className="size-5" /></span>;
  return <span aria-hidden className={cn(base, fillFor(sender.name))}>{initials(sender.name)}</span>;
}

const TZ = 'Asia/Singapore';
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/**
 * Dashed circular postmark, the signature mark of every letter.
 * Same-day letters read "Today · 2:10 pm"; others weekday · day · month. Dates are Singapore time, day-month order.
 */
export function Postmark({ at, className }: { at: string; className?: string }) {
  const locale = useLocale();
  const t = useTranslations('home');
  const d = new Date(at);
  const f = (o: Intl.DateTimeFormatOptions) => sgDate(d, locale, o);
  const today = dayKey(d) === dayKey(new Date());
  // "10:02 am" is too wide for the stamp: split the clock from its day period onto two lines.
  const parts = new Intl.DateTimeFormat(LOCALE_META[toLocale(locale)].intl, { hour: 'numeric', minute: '2-digit', timeZone: TZ }).formatToParts(d);
  const clock = { time: parts.filter((x) => x.type !== 'dayPeriod').map((x) => x.value).join('').trim(), period: parts.find((x) => x.type === 'dayPeriod')?.value ?? '' };
  const full = f({ weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const small = 'text-[0.6rem] font-semibold uppercase tracking-[0.08em] sm:text-[0.65rem]';
  return (
    <time
      dateTime={at}
      title={full}
      className={cn(
        'tend-postmark pointer-events-none grid size-14 shrink-0 select-none place-content-center rounded-full border-2 border-dashed border-input text-center font-heading leading-none text-muted-foreground sm:size-[4.25rem]',
        className,
      )}
    >
      <span className="sr-only">{full}</span>
      {today ? (
        <>
          <span aria-hidden className={small}>{t('today')}</span>
          <span aria-hidden className="text-sm font-bold tabular-nums text-foreground sm:text-lg">{clock.time}</span>
          {clock.period && <span aria-hidden className={small}>{clock.period}</span>}
        </>
      ) : (
        <>
          <span aria-hidden className={small}>{f({ weekday: 'short' })}</span>
          <span aria-hidden className="text-lg font-bold tabular-nums text-foreground sm:text-2xl">{f({ day: 'numeric' })}</span>
          <span aria-hidden className={small}>{f({ month: 'short' })}</span>
        </>
      )}
    </time>
  );
}

type LetterProps = {
  sender: Sender;
  /** What kind of letter this is ("Growth notes", "Peer Match"…), shown after the sender. */
  kind: string;
  /** ISO date for the postmark; omit for letters without one (e.g. one you are writing). */
  at?: string | null;
  unread?: boolean;
  /** Position in the letterbox, for the arrival stagger. */
  index?: number;
  as?: 'article' | 'section' | 'form';
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'> & { onSubmit?: React.FormEventHandler<HTMLFormElement> };

/**
 * A letter in the Home letterbox: who wrote, what it is about, a postmark, and one reply.
 * Children carry the heading, body and actions. The postmark sits on the header, so the body keeps the full width.
 */
export function Letter({ sender, kind, at, unread, index = 0, as: Tag = 'article', className, children, style, ...rest }: LetterProps) {
  const t = useTranslations('home');
  const name = sender.kind === 'person' ? sender.name : sender.kind === 'coach' ? t('coach') : t('you');
  return (
    <Tag
      {...(rest as Record<string, unknown>)}
      data-unread={unread || undefined}
      data-postmark={at ? '' : undefined}
      style={{ ['--i' as string]: index, ...style }}
      className={cn(
        'tend-letter group/letter relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 rounded-2xl border bg-card p-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-5 sm:p-6',
        unread ? 'border-primary ring-1 ring-primary/25' : 'border-border/80',
        sender.kind === 'you' && 'border-dashed bg-card/60',
        className,
      )}
    >
      <span className="sm:row-span-2"><Avatar sender={sender} /></span>
      {/* Phones: sender beside the avatar, body full width below. Wider: both stacked beside the avatar. */}
      <p className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 self-center text-sm leading-6 sm:self-start sm:pt-0.5', at && 'pr-16 sm:pr-24')}>
        {unread && (
          <span className="inline-flex items-center">
            <span aria-hidden className="mr-0.5 size-2 rounded-full bg-primary" />
            <span className="sr-only">{t('isNew')}: </span>
          </span>
        )}
        <span className="font-semibold text-foreground">{name}</span>
        <span className="whitespace-nowrap text-muted-foreground"><span aria-hidden>· </span>{kind}</span>
      </p>
      <div className="col-span-2 mt-3 grid min-w-0 content-start gap-2 sm:col-span-1 sm:col-start-2 sm:mt-1">
        {children}
      </div>
      {at && <Postmark at={at} className="absolute right-4 top-4 sm:right-5 sm:top-5" />}
    </Tag>
  );
}

/** Heading inside a letter. */
export function LetterTitle({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <h2 id={id} className={cn('text-lg font-semibold leading-snug text-balance sm:text-xl', className)}>{children}</h2>;
}
