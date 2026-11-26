/**
 * Coach guardrails (PRD M5.4): never judges, never diagnoses children, never asks for or stores
 * children's names, responds with care to distress, uses only the educator's own data, resists
 * prompt injection. These deterministic checks run BEFORE any model call, in both AI modes.
 */
import { COACH_PHRASES } from './phrases';

export type GuardResult =
  | { kind: 'ok'; text: string }
  | { kind: 'distress'; reply: string }
  | { kind: 'diagnosis'; reply: string; text: string };

const DISTRESS = /\b(overwhelm(ed|ing)?|burn(ed|t)? ?out|can['’]?t cope|cannot cope|want to (quit|give up|resign)|hopeless|breaking down|so (stressed|tired|exhausted)|crying (every|all)|panic attack|hate my job|no one (cares|helps)|want to die|hurt myself|self[- ]harm)\b/i;
const DIAGNOSIS = /\b(diagnos(e|is|ing)|does (he|she|this child|the child|child [a-z]) have|(is|might) (he|she|this child|the child) (be )?(autistic|adhd|dyslexic|delayed)|autism|adhd|asd\b|dyslexia|developmental delay|disorder|on the spectrum|special needs assessment)\b/i;
const INJECTION = /(ignore (all|any|the)? ?(previous|prior|above) (instructions|rules)|disregard (your|the) (rules|instructions)|you are now|act as (a|an) |system prompt|developer mode|reveal (your|the) (prompt|instructions)|show me (other|another) (educator|teacher)['’]?s|jailbreak)/i;

export const DISTRESS_REPLY = COACH_PHRASES.en.distress;

export const DIAGNOSIS_REPLY = COACH_PHRASES.en.diagnosis;

export function guard(input: string): GuardResult {
  const text = input.replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (DISTRESS.test(text)) return { kind: 'distress', reply: DISTRESS_REPLY };
  const cleaned = INJECTION.test(text) ? text.replace(INJECTION, '[removed]') : text;
  if (DIAGNOSIS.test(cleaned)) return { kind: 'diagnosis', reply: DIAGNOSIS_REPLY, text: cleaned };
  return { kind: 'ok', text: cleaned };
}

export const isInjection = (s: string) => INJECTION.test(s);

/** Post-filter for model output: strip any child name, enforce ≤ 120 words, at most one question. */
export function postFilter(out: string, redact: (s: string) => string, maxWords = 120): string {
  let s = redact(out).trim();
  const words = s.split(/\s+/);
  if (words.length > maxWords) s = `${words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '')}…`;
  // keep only the first question mark's sentence as a question
  let seen = false;
  s = s.replace(/[^.!?]*\?/g, (q) => {
    if (seen) return q.replace(/\?$/, '.');
    seen = true;
    return q;
  });
  return s;
}
