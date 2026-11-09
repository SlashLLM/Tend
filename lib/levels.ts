/**
 * Level & indicator presentation rules (PRD §2 Rule 1, §9).
 * Tend never shows a score, average or rank for a person — only
 * "Seen at Level 2 · next: try Level 3".
 */
export type Level = 1 | 2 | 3;
export type DomainKey = '1' | '2' | '3' | 'IT' | 'TRUE';

export function isLevel(n: unknown): n is Level {
  return n === 1 || n === 2 || n === 3;
}

/** Message key + values for the developmental level phrase. */
export function levelPhrase(level: number | null | undefined): { key: 'notYetObserved' | 'seenAtNext' | 'seenAtTop'; values: Record<string, number> } {
  if (!isLevel(level)) return { key: 'notYetObserved', values: {} };
  if (level === 3) return { key: 'seenAtTop', values: {} };
  return { key: 'seenAtNext', values: { level, next: level + 1 } };
}

/** Domain of a framework code: '3.3.4' → '3'; 'IT.1' → 'IT'; 'T' → 'TRUE'. */
export function domainOf(code: string): DomainKey {
  const head = code.split('.')[0];
  if (head === '1' || head === '2' || head === '3') return head;
  if (head === 'IT') return 'IT';
  return 'TRUE';
}

export const DOMAIN_CLASSES: Record<DomainKey, string> = {
  '1': 'bg-d1-fill text-d1-text',
  '2': 'bg-d2-fill text-d2-text',
  '3': 'bg-d3-fill text-d3-text',
  IT: 'bg-muted text-foreground',
  TRUE: 'bg-accent text-accent-foreground',
};

/** Below this, an AI tag is shown as "possible" and left unticked (PRD §8). */
export const POSSIBLE_THRESHOLD = 0.55;
export const isPossible = (confidence: number) => confidence < POSSIBLE_THRESHOLD;

/** 604000 → "10:04"; 3_725_000 → "1:02:05". */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Spoken form for screen readers: 604000 → "10 minutes 4 seconds". */
export function spokenMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s || !m) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}
