import { describe, expect, it } from 'vitest';
import { afterOnboardingPath, ONBOARDING_STEPS, stepIndex } from './onboarding';

describe('onboarding', () => {
  it('reads ?step= safely', () => {
    expect(stepIndex(undefined)).toBe(0);
    expect(stepIndex('1')).toBe(1);
    expect(stepIndex(['3', '1'])).toBe(3);
    expect(stepIndex(String(ONBOARDING_STEPS.length))).toBe(0);
    expect(stepIndex('-1')).toBe(0);
    expect(stepIndex('1.5')).toBe(0);
    expect(stepIndex('abc')).toBe(0);
  });

  it('educators continue into the needs analysis; everyone else goes home', () => {
    expect(afterOnboardingPath('educator', '/home')).toBe('/growth/needs-analysis');
    expect(afterOnboardingPath('leader', '/today')).toBe('/today');
    expect(afterOnboardingPath('admin', '/admin')).toBe('/admin');
    expect(afterOnboardingPath(null, '/no-access')).toBe('/no-access');
  });
});
