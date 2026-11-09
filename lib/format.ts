/** Dateline like "FRIDAY · 6 NOVEMBER" in Singapore time. */
export function dateline(d: Date, locale: string) {
  const loc = locale === 'zh' ? 'zh-CN' : 'en-SG';
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
