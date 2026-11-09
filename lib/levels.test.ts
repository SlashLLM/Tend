import { describe, expect, it } from 'vitest';
import { domainOf, formatMs, isLevel, isPossible, levelPhrase, POSSIBLE_THRESHOLD, spokenMs } from './levels';

describe('levelPhrase (never a score)', () => {
  it.each([
    [1, { key: 'seenAtNext', values: { level: 1, next: 2 } }],
    [2, { key: 'seenAtNext', values: { level: 2, next: 3 } }],
    [3, { key: 'seenAtTop', values: {} }],
    [null, { key: 'notYetObserved', values: {} }],
    [undefined, { key: 'notYetObserved', values: {} }],
    [0, { key: 'notYetObserved', values: {} }],
    [4, { key: 'notYetObserved', values: {} }],
    [2.3, { key: 'notYetObserved', values: {} }], // an average must never render as a level
  ])('%s → %o', (input, expected) => {
    expect(levelPhrase(input as number)).toEqual(expected);
  });

  it('isLevel accepts only 1, 2, 3', () => {
    expect([1, 2, 3].every(isLevel)).toBe(true);
    expect([0, 4, 1.5, '1', null].some(isLevel)).toBe(false);
  });
});

describe('domainOf', () => {
  it.each([
    ['1.1.1', '1'], ['2.1.3', '2'], ['3.3.4', '3'], ['3.4.5', '3'], ['IT.4', 'IT'], ['T', 'TRUE'], ['E', 'TRUE'],
  ])('%s → %s', (code, d) => expect(domainOf(code)).toBe(d));
});

describe('possible threshold', () => {
  it('is 0.55, exclusive', () => {
    expect(POSSIBLE_THRESHOLD).toBe(0.55);
    expect(isPossible(0.549)).toBe(true);
    expect(isPossible(0.55)).toBe(false);
    expect(isPossible(0.9)).toBe(false);
  });
});

describe('time formatting', () => {
  it.each([
    [0, '0:00'], [999, '0:00'], [1000, '0:01'], [604_000, '10:04'], [59_999, '0:59'], [3_725_000, '1:02:05'], [-5, '0:00'],
  ])('formatMs(%d) = %s', (ms, s) => expect(formatMs(ms)).toBe(s));

  it.each([
    [604_000, '10 minutes 4 seconds'], [60_000, '1 minute'], [1000, '1 second'], [0, '0 seconds'], [61_000, '1 minute 1 second'],
  ])('spokenMs(%d) = %s', (ms, s) => expect(spokenMs(ms)).toBe(s));
});
