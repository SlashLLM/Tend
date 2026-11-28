import { LOCALE_META, toLocale } from '@/i18n/routing';

/** Dateline like "FRIDAY · 6 NOVEMBER" in Singapore time. */
export function dateline(d: Date, locale: string) {
  const loc = LOCALE_META[toLocale(locale)].intl;
  const tz = 'Asia/Singapore';
  const weekday = d.toLocaleDateString(loc, { weekday: 'long', timeZone: tz });
  const date = d.toLocaleDateString(loc, { day: 'numeric', month: 'long', timeZone: tz });
  return `${weekday} · ${date}`;
}

export function firstName(full: string) {
  // "Aisha binte Rahman" → "Aisha"; "Lee Mei Ling" → "Mei Ling" (Chinese given name follows the surname)
  const parts = full.trim().split(/\s+/);
  if (parts.length === 3 && /^(Lee|Tan|Lim|Ong|Chen|Zhang|Wong|Teo|Koh|Goh|Ho|Chua|Yeo|Tay)$/.test(parts[0])) return `${parts[1]} ${parts[2]}`;
  return parts[0];
}

/** Format a date in Singapore time with the locale's Intl tag (en-SG gives day-month order, matching the dateline). */
export function sgDate(d: Date, locale: string, opts: Intl.DateTimeFormatOptions) {
  return d.toLocaleString(LOCALE_META[toLocale(locale)].intl, { ...opts, timeZone: 'Asia/Singapore' });
}

/** ISO instant → "YYYY-MM-DDTHH:mm" in Singapore time, for <input type="datetime-local">. */
export function toSgInput(iso: string | null) {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "YYYY-MM-DDTHH:mm" read as Singapore time → ISO instant. */
export function fromSgInput(v: string) {
  return new Date(`${v}:00+08:00`).toISOString();
}
