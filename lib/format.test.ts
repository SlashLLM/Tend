import { describe, expect, it } from 'vitest';
import { dateline, firstName } from './format';

describe('format', () => {
  it('dateline uses Singapore time', () => {
    // 20:00 UTC on 5 Nov is 04:00 on 6 Nov in Singapore
    expect(dateline(new Date('2026-11-05T20:00:00Z'), 'en')).toBe('Friday · 6 November');
    expect(dateline(new Date('2026-11-05T20:00:00Z'), 'zh')).toMatch(/星期五 · 11月6日/);
    expect(dateline(new Date('2026-11-05T20:00:00Z'), 'ms')).toBe('Jumaat · 6 November');
  });

  it.each([
    ['Aisha binte Rahman', 'Aisha'], ['Lee Mei Ling', 'Mei Ling'], ['Sandra Tan', 'Sandra'], ['Ravi Kumar', 'Ravi'], ['Tan Hui Min', 'Hui Min'], ['Farah', 'Farah'],
  ])('firstName(%s) = %s', (full, first) => expect(firstName(full)).toBe(first));
});
