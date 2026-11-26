import { describe, expect, it } from 'vitest';
import { finaliseTags, frameworkList, type Framework } from './course-tags';

const fw: Framework = {
  indicators: [
    { code: '3.3.4', name: 'Open-ended questions', subdomain_code: '3.3', subdomain_name: 'Language and thinking' },
    { code: '3.3.5', name: 'Higher-order thinking', subdomain_code: '3.3', subdomain_name: 'Language and thinking' },
    { code: '2.2.4', name: 'Emotional regulation', subdomain_code: '2.2', subdomain_name: 'Social-emotional' },
  ],
  tscByIndicator: { '3.3.4': ['EC-TSC-LAN'], '3.3.5': ['EC-TSC-LAN'], '2.2.4': ['EC-TSC-VAL'] },
};
const now = new Date('2026-11-26T00:00:00Z');

describe('finaliseTags', () => {
  it('drops invented codes and derives subdomains and skills-framework codes', () => {
    const t = finaliseTags({ relevant: true, indicator_codes: ['3.3.4', '9.9.9', '2.2.4', '3.3.4'], level_min: 2, level_max: 1, confidence: 'high', reason: ' Good fit. ' }, fw, now);
    expect(t).toMatchObject({
      relevant: true, indicator_codes: ['3.3.4', '2.2.4'], subdomain_codes: ['3.3', '2.2'], tsc_codes: ['EC-TSC-LAN', 'EC-TSC-VAL'],
      level_min: 1, level_max: 2, confidence: 'high', reason: 'Good fit.', suggested_at: now.toISOString(),
    });
  });
  it('caps at four indicators', () => {
    const many = { ...fw, indicators: Array.from({ length: 6 }, (_, i) => ({ code: `1.1.${i}`, name: `n${i}`, subdomain_code: '1.1', subdomain_name: 's' })) };
    expect(finaliseTags({ relevant: true, indicator_codes: many.indicators.map((i) => i.code), level_min: 1, level_max: 3, confidence: 'medium', reason: '' }, many, now).indicator_codes).toHaveLength(4);
  });
  it('is not relevant (and low confidence) when no real code survives', () => {
    const t = finaliseTags({ relevant: true, indicator_codes: ['X'], level_min: 1, level_max: 3, confidence: 'high', reason: 'r' }, fw, now);
    expect(t).toMatchObject({ relevant: false, indicator_codes: [], confidence: 'low' });
  });
});

describe('frameworkList', () => {
  it('groups indicators under their subdomain in code order', () => {
    expect(frameworkList(fw)).toBe('2.2 Social-emotional\n  2.2.4 Emotional regulation\n3.3 Language and thinking\n  3.3.4 Open-ended questions\n  3.3.5 Higher-order thinking');
  });
});
