/**
 * Registry seed data other than the QTT itself.
 *
 * IMPORTANT: Skills Framework (SFw EC) codes/titles and the course catalogue below are
 * PLACEHOLDERS for the demo. PRD open question Q2 (which SFw job titles and proficiency
 * levels Agape uses) and "real course titles only where verified" both apply — replace
 * with verified data before the pilot. Every placeholder is flagged `draft: true`.
 */
import qtt from './qtt_framework.json';

export type QttIndicator = { code: string; name: string; levels: Record<'1' | '2' | '3', string>; look_fors: string[] };
export type QttSubdomain = { code: string; name: string; indicators: QttIndicator[] };
export type QttDomain = { code: string; name: string; subdomains: QttSubdomain[] };
export const QTT = qtt as unknown as {
  framework: { code: string; name: string; version: string; age_band: string; source: string };
  levels: Record<'1' | '2' | '3', string>;
  domains: QttDomain[];
};

export type FlatIndicator = QttIndicator & {
  domain_code: string; domain_name: string; subdomain_code: string; subdomain_name: string;
};

export function flatIndicators(): FlatIndicator[] {
  return QTT.domains.flatMap((d) =>
    d.subdomains.flatMap((s) =>
      s.indicators.map((i) => ({ ...i, domain_code: d.code, domain_name: d.name, subdomain_code: s.code, subdomain_name: s.name })),
    ),
  );
}

/** Skills Framework for Early Childhood — technical skills (DRAFT placeholders). */
export const TSC = [
  { code: 'EC-TSC-REL', title: 'Positive Relationships and Interactions with Children', category: 'Child Development and Well-being' },
  { code: 'EC-TSC-VAL', title: 'Values and Social-Emotional Development', category: 'Child Development and Well-being' },
  { code: 'EC-TSC-DIS', title: 'Learning Dispositions', category: 'Child Development and Well-being' },
  { code: 'EC-TSC-CUR', title: 'Curriculum Planning and Learning Environment', category: 'Curriculum and Pedagogy' },
  { code: 'EC-TSC-PLY', title: 'Child-Centred and Play-Based Pedagogy', category: 'Curriculum and Pedagogy' },
  { code: 'EC-TSC-LAN', title: 'Language, Literacy and Thinking Skills Facilitation', category: 'Curriculum and Pedagogy' },
  { code: 'EC-TSC-EXF', title: 'Self-Regulation and Executive Function Support', category: 'Curriculum and Pedagogy' },
  { code: 'EC-TSC-INF', title: 'Infant and Toddler Care and Development', category: 'Child Development and Well-being' },
].map((t) => ({ ...t, draft: true, proficiency_levels: { '1': 'Basic', '2': 'Intermediate', '3': 'Advanced' } }));

/** Fixed, explainable gap→skill mapping (PRD rule 2: data, not AI guesswork). */
export const SUBDOMAIN_TO_TSC: Record<string, string> = {
  '1.1': 'EC-TSC-REL',
  '2.1': 'EC-TSC-VAL',
  '2.2': 'EC-TSC-VAL',
  '2.3': 'EC-TSC-DIS',
  '3.1': 'EC-TSC-CUR',
  '3.2': 'EC-TSC-PLY',
  '3.3': 'EC-TSC-LAN',
  '3.4': 'EC-TSC-EXF',
};

export const OCCUPATIONAL_TITLES = [
  { code: 'EYE', name: 'Early Years Educator', age_group: 'infant_toddler' as const },
  { code: 'PT', name: 'Preschool Teacher', age_group: 'preschool' as const },
  { code: 'LT', name: 'Lead Teacher', age_group: 'preschool' as const },
  { code: 'CL', name: 'Centre Leader', age_group: 'all' as const },
];

/** EYDF-aligned practice set for under-2s (PRD Q1 default; DRAFT, to be written with Agape). */
export const EYDF_PRACTICES = [
  { code: 'IT.1', name: 'Responsive Caregiving Routines', subdomain: 'Care and Routines' },
  { code: 'IT.2', name: 'Secure Attachment and Key-Carer Relationships', subdomain: 'Relationships' },
  { code: 'IT.3', name: 'Safe and Stimulating Environment for Exploration', subdomain: 'Environment' },
  { code: 'IT.4', name: 'Serve-and-Return Communication', subdomain: 'Communication' },
  { code: 'IT.5', name: 'Supporting Early Self-Regulation', subdomain: 'Well-being' },
  { code: 'IT.6', name: 'Partnering with Families', subdomain: 'Relationships' },
];

/** Agape TRUE values — optional second tagging lens. */
export const TRUE_VALUES = [
  { code: 'T', name: 'Trust' },
  { code: 'R', name: 'Resilience' },
  { code: 'U', name: 'Unity' },
  { code: 'E', name: 'Empowerment' },
];

type Activity = {
  tier: 'internal' | 'micro' | 'course';
  provider: string; title: string; mode: string; hours: number; fee_sgd: number;
  funding: string | null; funded: boolean; next_run_days: number | null;
  indicator_codes: string[]; subdomain_codes: string[]; tsc_codes: string[]; level_min: number; level_max: number;
};

/** 20 sample external courses. Titles are generic SAMPLES (not verified real courses). */
export const COURSES: Activity[] = [
  ['NIEC', 'Sample: Questioning Techniques that Extend Children’s Thinking', ['3.3.4', '3.3.5'], ['3.3'], 1, 2, 14, 'Face-to-face', 12, 380, true],
  ['NIEC', 'Sample: Scaffolding Higher-Order Thinking in K1–K2', ['3.3.5', '3.3.6'], ['3.3'], 2, 3, 40, 'Blended', 18, 520, true],
  ['NIEC', 'Sample: Self-Regulation in the Early Years', ['3.4.2', '3.4.1'], ['3.4'], 1, 2, 21, 'Face-to-face', 12, 380, true],
  ['NIEC', 'Sample: Executive Function Games for Preschoolers', ['3.4.3', '3.4.4', '3.4.5'], ['3.4'], 1, 3, 60, 'Online', 6, 180, true],
  ['WSQ', 'Sample: Supporting Children’s Emotional Regulation', ['2.2.4', '2.2.3'], ['2.2'], 1, 2, 30, 'Face-to-face', 14, 420, true],
  ['WSQ', 'Sample: Building Positive Relationships with Young Children', ['1.1.1', '1.1.2', '1.1.3'], ['1.1'], 1, 2, 10, 'Face-to-face', 12, 360, true],
  ['ECDA', 'Sample: Celebrating Diversity in the Preschool Classroom', ['2.1.3'], ['2.1'], 1, 3, 45, 'Online', 4, 0, true],
  ['ECDA', 'Sample: Values Education through Stories', ['2.1.1', '2.1.2'], ['2.1'], 1, 2, 75, 'Online', 3, 0, true],
  ['NIEC', 'Sample: Play-Based Pedagogy in Practice', ['3.2.5', '3.2.1'], ['3.2'], 1, 3, 28, 'Blended', 15, 450, true],
  ['NIEC', 'Sample: Child Agency — Choices, Voice and Leadership', ['3.2.3', '3.2.4', '3.2.2'], ['3.2'], 2, 3, 90, 'Face-to-face', 12, 380, true],
  ['WSQ', 'Sample: Integrated Curriculum Planning', ['3.1.1', '3.1.4'], ['3.1'], 1, 2, 35, 'Face-to-face', 18, 540, true],
  ['WSQ', 'Sample: Differentiated Learning for Diverse Learners', ['3.1.2', '3.1.6'], ['3.1'], 2, 3, 50, 'Blended', 16, 480, true],
  ['NIEC', 'Sample: Proactive Guidance and Classroom Expectations', ['3.1.5', '3.1.3'], ['3.1'], 1, 2, 18, 'Face-to-face', 8, 260, true],
  ['ECDA', 'Sample: Language-Rich Classrooms', ['3.3.1', '3.3.3'], ['3.3'], 1, 2, 12, 'Online', 4, 0, true],
  ['NIEC', 'Sample: Emergent Literacy and Print Awareness', ['3.3.2'], ['3.3'], 1, 2, 65, 'Face-to-face', 10, 320, true],
  ['WSQ', 'Sample: Problem-Solving with Young Children', ['3.3.7', '3.3.8'], ['3.3'], 2, 3, 120, 'Blended', 14, 420, false],
  ['Private', 'Sample: Fostering Curiosity and Inventiveness (STEAM)', ['2.3.4', '2.3.5'], ['2.3'], 1, 3, 25, 'Face-to-face', 12, 650, false],
  ['NIEC', 'Sample: Growth Mindset and Perseverance', ['2.3.1', '2.3.2'], ['2.3'], 1, 2, 160, 'Online', 6, 200, true],
  ['WSQ', 'Sample: Social Competence and Prosocial Behaviour', ['2.2.5', '2.2.6', '2.2.7'], ['2.2'], 1, 2, 55, 'Face-to-face', 12, 380, true],
  ['NIEC', 'Sample: Responsive Care for Infants and Toddlers', [], [], 1, 3, 20, 'Face-to-face', 15, 450, true],
].map(([provider, title, indicator_codes, subdomain_codes, level_min, level_max, next_run_days, mode, hours, fee, funded]) => ({
  tier: 'course' as const,
  provider: provider as string,
  title: title as string,
  mode: mode as string,
  hours: hours as number,
  fee_sgd: fee as number,
  funded: funded as boolean,
  funding: (funded as boolean) ? 'SkillsFuture / ECDA funding (sample)' : null,
  next_run_days: next_run_days as number,
  indicator_codes: indicator_codes as string[],
  subdomain_codes: subdomain_codes as string[],
  tsc_codes: (subdomain_codes as string[]).map((s) => SUBDOMAIN_TO_TSC[s]).filter(Boolean),
  level_min: level_min as number,
  level_max: level_max as number,
}));

/** 10 internal / micro-learning activities (PRD Q9 default: 10 samples). */
export const INTERNAL_ACTIVITIES: Activity[] = [
  ['internal', 'Story-time Questioning Learning Circle (4 weeks)', ['3.3.4', '3.3.5'], ['3.3'], 2, 'In-centre'],
  ['internal', 'Calm Classroom PLC: Self-Regulation Strategies', ['3.4.2', '3.4.1', '2.2.4'], ['3.4', '2.2'], 4, 'In-centre'],
  ['internal', 'Diversity Celebration Planning Group', ['2.1.3'], ['2.1'], 3, 'In-centre'],
  ['internal', 'Play Partners: Joining Children’s Play', ['3.2.5'], ['3.2'], 3, 'In-centre'],
  ['internal', 'Agape Values in Action Workshop', ['2.1.1', '2.1.2'], ['2.1'], 2, 'HQ'],
  ['micro', 'Micro: The 3-Second Wait Time', ['3.3.4'], ['3.3'], 0.25, 'Video'],
  ['micro', 'Micro: Naming Feelings in the Moment', ['2.2.2', '2.2.3'], ['2.2'], 0.25, 'Video'],
  ['micro', 'Micro: Stop–Go Games for Self-Control', ['3.4.2'], ['3.4'], 0.25, 'Video'],
  ['micro', 'Micro: Specific Feedback That Stretches Thinking', ['3.3.6'], ['3.3'], 0.25, 'Video'],
  ['micro', 'Micro: Plan–Do–Review in 10 Minutes', ['3.4.5', '2.3.2'], ['3.4', '2.3'], 0.25, 'Video'],
].map(([tier, title, indicator_codes, subdomain_codes, hours, mode], i) => ({
  tier: tier as 'internal' | 'micro',
  provider: 'Agape',
  title: title as string,
  mode: mode as string,
  hours: hours as number,
  fee_sgd: 0,
  funded: true,
  funding: 'Internal',
  next_run_days: tier === 'micro' ? 0 : 7 + i * 3,
  indicator_codes: indicator_codes as string[],
  subdomain_codes: subdomain_codes as string[],
  tsc_codes: (subdomain_codes as string[]).map((s) => SUBDOMAIN_TO_TSC[s]).filter(Boolean),
  level_min: 1,
  level_max: 3,
}));
