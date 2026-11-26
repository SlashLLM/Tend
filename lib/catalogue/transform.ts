/**
 * Turn rows from the MySkillsFuture open datasets (data.gov.sg) into catalogue entries.
 * Pure functions: no network, no database. Tested in transform.test.ts.
 */

export const DATASETS = {
  courses: 'd_b5802b76f409764c16dde4bf2feb19cd', // MySkillsFuture Course Directory
  runs: 'd_60e4423c61d7bbe3c4cf07552197987b', // MySkillsFuture Course Run
} as const;

export const ATTRIBUTION =
  'Contains information from MySkillsFuture Course Directory and Course Run accessed from data.gov.sg, made available under the Open Data Licence.';

/** CPD-sized courses only; certificates and diplomas are hundreds of hours. */
export const MAX_HOURS = 40;

export type CourseRow = Record<string, string>;
export type RunRow = Record<string, string>;

export type ImportedActivity = {
  source_ref: string;
  provider: string;
  title: string;
  description: string;
  mode: string | null;
  hours: number | null;
  fee_sgd: number | null;
  fee_after_subsidy_sgd: number | null;
  funded: boolean;
  funding: string | null;
  next_run: string | null;
  url: string;
};

const INCLUDE = /early[\s-]*childhood|pre-?school|infants?\b|toddlers?|kindergarten|young children|early years|child(?:ren)?['’]s? (?:development|learning|play|wellbeing|well-being)|playgroup|EYDF|NEL framework/i;
const EXCLUDE =
  /\b(?:first aid|cpr|aed|bcls|cardiac|basic life support|food hygiene|food safety|workplace safety|wsh|forklift|employee engagement|human resource|payroll|accounting|bookkeeping|excel|digital marketing|real estate|insurance|financial planning)\b/i;

/** Early-childhood professional-development course that fits a CPD plan (short, sector-specific). */
export function isEarlyChildhoodCPD(c: CourseRow): boolean {
  const hours = num(c.number_of_hours);
  if (hours === null || hours <= 0 || hours > MAX_HOURS) return false;
  const title = c.coursetitle ?? '';
  const text = `${title} ${(c.about_this_course ?? '').slice(0, 600)}`;
  if (EXCLUDE.test(title)) return false;
  return INCLUDE.test(text);
}

export function num(v: string | undefined | null): number | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Dollars rounded to cents (the source has values like 152.625). */
export function money(v: string | undefined | null): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n * 100) / 100;
}

/** Excel serial day (1900 date system) → ISO date. Also accepts ISO / d/m/y strings. */
export function excelDate(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const ms = Math.round((Number(s) - 25569) * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

/** Earliest run that starts today or later, if any. */
export function nextRun(runs: RunRow[], today: string): { date: string; mode: string | null } | null {
  let best: { date: string; mode: string | null } | null = null;
  for (const r of runs) {
    const d = excelDate(r.courserunstartdate);
    if (!d || d < today) continue;
    if (!best || d < best.date) best = { date: d, mode: r.mode_of_training?.trim() || null };
  }
  return best;
}

/** "KLC INTERNATIONAL INSTITUTE PTE. LTD." → "KLC International Institute Pte. Ltd."; keeps short acronyms. */
export function tidyProvider(s: string): string {
  const t = (s ?? '').trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[^a-z]/g, '');
      if (bare.length > 0 && bare.length <= 4 && /^(?:klc|niec|nus|ntu|smu|suss|ite|nyp|sp|tp|np|rp|wsq|ecda|sgs|aic|hmi|eon|pcf|ssi)$/.test(bare)) return w.toUpperCase();
      if (i > 0 && /^(?:of|and|for|the|in|at|&)$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

export function courseUrl(ref: string): string {
  // The old portal link (…/course-detail.html?courseReferenceNumber=…) now redirects here.
  return `https://courses.myskillsfuture.gov.sg/courses/${encodeURIComponent(ref)}`;
}

export function toActivity(c: CourseRow, runs: RunRow[], today: string): ImportedActivity {
  const ref = c.coursereferencenumber.trim();
  const fee = money(c.full_course_fee);
  const after = money(c.course_fee_after_subsidies);
  const funded = fee !== null && after !== null && after < fee;
  const run = nextRun(runs, today);
  const about = (c.about_this_course ?? '').trim();
  const learn = (c.what_you_learn ?? '').trim();
  return {
    source_ref: ref,
    provider: tidyProvider(c.trainingprovideralias ?? ''),
    title: (c.coursetitle ?? '').trim().replace(/\s+/g, ' '),
    description: [about, learn].filter(Boolean).join('\n\n').slice(0, 4000),
    mode: run?.mode ?? (c.training_commitment?.trim() || null),
    hours: num(c.number_of_hours),
    fee_sgd: fee,
    fee_after_subsidy_sgd: after,
    funded,
    funding: funded ? 'SkillsFuture-funded' : null,
    next_run: run?.date ?? null,
    url: courseUrl(ref),
  };
}

/** Filter + transform a full dataset pair. Duplicated course refs keep the first row. */
export function buildCatalogue(courses: CourseRow[], runs: RunRow[], today: string): ImportedActivity[] {
  const runsByRef = new Map<string, RunRow[]>();
  for (const r of runs) {
    const ref = r.coursereferencenumber?.trim();
    if (!ref) continue;
    (runsByRef.get(ref) ?? runsByRef.set(ref, []).get(ref)!).push(r);
  }
  const seen = new Set<string>();
  const out: ImportedActivity[] = [];
  for (const c of courses) {
    const ref = c.coursereferencenumber?.trim();
    if (!ref || seen.has(ref) || !isEarlyChildhoodCPD(c)) continue;
    seen.add(ref);
    out.push(toActivity(c, runsByRef.get(ref) ?? [], today));
  }
  return out;
}
