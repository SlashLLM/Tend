/**
 * Step 2 · Redact (PRD §8): child names → "Child A/B/…" using the class roster,
 * plus phone numbers, NRIC/FIN numbers and email addresses. Deterministic: the same
 * child always gets the same letter within one observation.
 */
export type RosterEntry = { child_name: string; aliases?: string[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeRedactor(roster: RosterEntry[]) {
  // Longest names first so "Wei Ling" wins over "Wei".
  const entries = roster
    .flatMap((r, i) => [r.child_name, ...(r.aliases ?? [])].filter(Boolean).map((n) => ({ n: n.trim(), key: r.child_name.toLowerCase(), i })))
    .filter((e) => e.n.length >= 2)
    .sort((a, b) => b.n.length - a.n.length);
  const letters = new Map<string, string>();
  const labelFor = (key: string) => {
    if (!letters.has(key)) {
      const k = letters.size;
      letters.set(key, `Child ${k < 26 ? String.fromCharCode(65 + k) : `#${k + 1}`}`);
    }
    return letters.get(key)!;
  };
  const patterns = entries.map((e) => ({ re: new RegExp(`(?<![\\p{L}])${escape(e.n)}(?:'s)?(?![\\p{L}])`, 'giu'), key: e.key }));

  return function redact(text: string): string {
    let out = text;
    for (const p of patterns) out = out.replace(p.re, (m) => labelFor(p.key) + (/'s$/i.test(m) ? "'s" : ''));
    out = out
      .replace(/\b[STFGM]\d{7}[A-Z]\b/gi, '[ID removed]') // NRIC / FIN
      .replace(/(?<!\d)(?:\+65[\s-]?)?[689]\d{3}[\s-]?\d{4}(?!\d)/g, '[phone removed]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email removed]');
    return out;
  };
}

/** True if any roster name survives in the text (used by tests and as a final guard). */
export function leaksName(text: string, roster: RosterEntry[]) {
  return roster.some((r) => [r.child_name, ...(r.aliases ?? [])].some((n) => n && new RegExp(`(?<![\\p{L}])${escape(n)}(?![\\p{L}])`, 'iu').test(text)));
}
