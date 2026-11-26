import { describe, expect, it } from 'vitest';
import { buildCatalogue, excelDate, isEarlyChildhoodCPD, money, nextRun, tidyProvider, toActivity } from './transform';

const course = (o: Record<string, string> = {}) => ({
  coursereferencenumber: 'TGS-1',
  coursetitle: 'Using Music in the Infant Classrooms',
  trainingprovideralias: 'NATIONAL INSTITUTE OF EARLY CHILDHOOD DEVELOPMENT',
  full_course_fee: '234.5',
  course_fee_after_subsidies: '117.25',
  number_of_hours: '7',
  training_commitment: 'Part Time',
  about_this_course: 'Music for babies and toddlers.',
  what_you_learn: 'Songs and rhythm.',
  ...o,
});

describe('isEarlyChildhoodCPD', () => {
  it('keeps short early-childhood courses', () => {
    expect(isEarlyChildhoodCPD(course())).toBe(true);
    expect(isEarlyChildhoodCPD(course({ coursetitle: 'Learning Numeracy Through Play', about_this_course: 'For preschool teachers.' }))).toBe(true);
  });
  it('drops long certificates and diplomas', () => {
    expect(isEarlyChildhoodCPD(course({ coursetitle: 'Higher Certificate in Infant Care', number_of_hours: '180' }))).toBe(false);
  });
  it('drops generic courses that mention children in passing', () => {
    expect(isEarlyChildhoodCPD(course({ coursetitle: 'Basic Cardiac Life Support (BCLS) + AED Course', about_this_course: 'Includes infants.' }))).toBe(false);
    expect(isEarlyChildhoodCPD(course({ coursetitle: 'Employee Engagement Essentials', about_this_course: 'for preschool leaders' }))).toBe(false);
    expect(isEarlyChildhoodCPD(course({ coursetitle: 'Excel for Beginners', about_this_course: 'spreadsheets' }))).toBe(false);
  });
  it('drops rows without usable hours', () => {
    expect(isEarlyChildhoodCPD(course({ number_of_hours: '' }))).toBe(false);
  });
});

describe('dates and money', () => {
  it('converts Excel serial days', () => {
    expect(excelDate('46296')).toBe('2026-10-01');
    expect(excelDate('2027-01-21')).toBe('2027-01-21');
    expect(excelDate('3/2/2027')).toBe('2027-02-03');
    expect(excelDate('')).toBeNull();
  });
  it('rounds money to cents', () => {
    expect(money('152.625')).toBe(152.63);
    expect(money('')).toBeNull();
  });
});

describe('nextRun', () => {
  const runs = [
    { courserunstartdate: '46296', mode_of_training: 'Classroom' }, // 2026-10-01 (past)
    { courserunstartdate: '46400', mode_of_training: 'Synchronous eLearning' }, // 2027-01-13
    { courserunstartdate: '46380', mode_of_training: 'Classroom' }, // 2026-12-24
  ];
  it('picks the earliest run on or after today', () => {
    expect(nextRun(runs, '2026-11-26')).toEqual({ date: '2026-12-24', mode: 'Classroom' });
  });
  it('returns null when every run is past', () => {
    expect(nextRun(runs, '2027-06-01')).toBeNull();
  });
});

describe('toActivity / buildCatalogue', () => {
  it('maps fees, funding, provider and link', () => {
    const a = toActivity(course(), [{ courserunstartdate: '46400', mode_of_training: 'Classroom' }], '2026-11-26');
    expect(a).toMatchObject({
      source_ref: 'TGS-1', provider: 'National Institute of Early Childhood Development', hours: 7, fee_sgd: 234.5, fee_after_subsidy_sgd: 117.25,
      funded: true, funding: 'SkillsFuture-funded', next_run: '2027-01-13', mode: 'Classroom',
    });
    expect(a.url).toBe('https://courses.myskillsfuture.gov.sg/courses/TGS-1');
  });
  it('is not funded when the subsidised fee is the full fee', () => {
    expect(toActivity(course({ course_fee_after_subsidies: '234.5' }), [], '2026-11-26')).toMatchObject({ funded: false, funding: null, next_run: null, mode: 'Part Time' });
  });
  it('filters, de-duplicates and joins runs by course reference', () => {
    const out = buildCatalogue(
      [course(), course(), course({ coursereferencenumber: 'TGS-2', coursetitle: 'Forklift Operation', about_this_course: 'warehouse' })],
      [{ coursereferencenumber: 'TGS-1', courserunstartdate: '46400', mode_of_training: 'Classroom' }],
      '2026-11-26',
    );
    expect(out.map((a) => [a.source_ref, a.next_run])).toEqual([['TGS-1', '2027-01-13']]);
  });
  it('tidies all-caps provider names but keeps acronyms', () => {
    expect(tidyProvider('KLC INTERNATIONAL INSTITUTE PTE. LTD.')).toBe('KLC International Institute Pte. Ltd.');
    expect(tidyProvider('Society for WINGS')).toBe('Society for WINGS');
  });
});
