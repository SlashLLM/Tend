import { describe, expect, it } from 'vitest';
import { buildAgenda } from './debrief';
import { hasToneIssue } from './pipeline/tone';

describe('Debrief agenda', () => {
  const base = { glows: ['You asked an open why-question and waited.'], grows: ['An opportunity to grow towards Level 3 in questioning: “Uses follow-up questions”.'], nextStep: 'Try one follow-up question.', reflection: 'The children were quiet when I asked why.', contexts: [] };

  it('has 1 celebration, 2 questions drawn from the reflection first, 1 decision', () => {
    const a = buildAgenda(base);
    expect(a.celebrate).toMatch(/^Celebrate: You asked/);
    expect(a.questions).toHaveLength(2);
    expect(a.questions[0]).toContain('The children were quiet');
    expect(a.decision).toMatch(/^Agree one step: Try one follow-up/);
  });

  it('questions, not verdicts: every agenda item is non-judgemental and the questions end with "?"', () => {
    const a = buildAgenda(base);
    for (const q of a.questions) expect(q.trim().endsWith('?')).toBe(true);
    for (const s of [a.celebrate, ...a.questions, a.decision]) expect(hasToneIssue(s)).toBe(false);
  });

  it('uses the educator’s added context when there is no reflection', () => {
    const a = buildAgenda({ ...base, reflection: null, contexts: ['Two children were new that day'] });
    expect(a.questions[0]).toContain('Two children were new');
  });

  it('degrades gracefully with nothing to go on', () => {
    const a = buildAgenda({ glows: [], grows: [], nextStep: '', reflection: null, contexts: [] });
    expect(a.celebrate).toMatch(/Celebrate/);
    expect(a.questions.length).toBeGreaterThanOrEqual(1);
    expect(a.decision).toMatch(/Agree one small step/);
  });
});
