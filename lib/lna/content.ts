/**
 * Learning Needs Analysis content (PRD M2). Three question types:
 *   scenario  — a real classroom situation; each option maps to a QTT level (1–3)
 *   self      — "which best describes your practice?" on the 3 levels (per subdomain)
 *   confidence — how sure the educator feels (per subdomain)
 * Scenarios are Tend drafts for Agape's curriculum team to review.
 */
import { EYDF_PRACTICES, QTT } from '../../supabase/seed/registry';

export type ScenarioOption = { id: string; text: string; level: 1 | 2 | 3 };
export type Question =
  | { id: string; type: 'scenario'; subdomain: string; indicator: string; prompt: string; options: ScenarioOption[] }
  | { id: string; type: 'self'; subdomain: string; prompt: string }
  | { id: string; type: 'confidence'; subdomain: string; prompt: string };

type S = { indicator: string; prompt: string; l1: string; l2: string; l3: string };

const SCENARIOS: S[] = [
  { indicator: '1.1.2', prompt: 'During free play, a quiet child keeps glancing at you while building with blocks. What do you most likely do?',
    l1: 'Smile and say “Nice building!” as you walk past.', l2: 'Go over, kneel down and ask what they are making.', l3: 'Sit beside them, describe what you notice, and follow their lead as they explain their plan.' },
  { indicator: '1.1.4', prompt: 'A child bursts into tears because another child took the red crayon. What do you most likely do?',
    l1: 'Comfort the child and give them another crayon.', l2: 'Name the feeling (“You’re upset”) and suggest asking for a turn.', l3: 'Name the feeling, then help both children talk it through and agree on a plan themselves.' },
  { indicator: '2.1.2', prompt: 'You notice a child helping a friend pick up spilled beads. What do you most likely do?',
    l1: 'Say “Good job!”', l2: 'Say “You helped Mei pick up her beads — that was kind.”', l3: 'Invite the class to notice the kind act and talk about how it helped.' },
  { indicator: '2.1.3', prompt: 'A child asks why a classmate eats with their hands at lunch. What do you most likely do?',
    l1: 'Say “Everyone eats differently” and move on.', l2: 'Explain that families have different customs and that all are welcome.', l3: 'Invite the classmate (if they want) to share about it, and plan a class activity on food from home.' },
  { indicator: '2.2.2', prompt: 'A child stomps their feet and frowns after losing a game. What do you most likely do?',
    l1: 'Tell them it’s just a game.', l2: 'Say “You look frustrated” and wait with them.', l3: 'Help them notice their body cues and name the feeling, then ask how others in the game might feel.' },
  { indicator: '2.2.4', prompt: 'At circle time a child keeps shouting out. What do you most likely do?',
    l1: 'Remind them to be quiet.', l2: 'Quietly offer a strategy, like holding a “talking stone” while waiting.', l3: 'Use a waiting strategy the class practised together, and let the child choose their own calm-down tool.' },
  { indicator: '2.3.1', prompt: 'A child gives up on a puzzle, saying “It’s too hard.” What do you most likely do?',
    l1: 'Finish the puzzle together quickly.', l2: 'Break it into steps: “Let’s find all the edge pieces first.”', l3: 'Ask what they have tried, encourage another strategy, and celebrate their effort when they keep going.' },
  { indicator: '2.3.5', prompt: 'A child brings in a snail from the garden. What do you most likely do?',
    l1: 'Say “How interesting!” and put it back outside.', l2: 'Ask the group what they notice about the snail.', l3: 'Let the children’s questions about the snail shape an investigation over the next few days.' },
  { indicator: '3.1.2', prompt: 'Some children finish a counting activity quickly while others struggle. What do you most likely do?',
    l1: 'Ask the fast finishers to wait quietly.', l2: 'Give extension cards to some and extra support to others.', l3: 'Offer the activity at different levels from the start and let children choose their challenge.' },
  { indicator: '3.1.5', prompt: 'Transitions to outdoor play are often noisy and rushed. What do you most likely do?',
    l1: 'Remind children of the rules each time.', l2: 'Explain the reason for the routine and give a warning before transitions.', l3: 'Work with the children to agree the routine and let them remind each other.' },
  { indicator: '3.2.3', prompt: 'You are planning the art activity for tomorrow. What do you most likely do?',
    l1: 'Prepare one art activity for everyone.', l2: 'Offer two or three choices of materials.', l3: 'Ask the children what they want to make and help them plan and gather materials.' },
  { indicator: '3.2.5', prompt: 'Children are playing “shop” in the pretend corner. What do you most likely do?',
    l1: 'Supervise from nearby.', l2: 'Join as a customer and ask questions to extend the play.', l3: 'Join briefly, add a problem to solve (e.g. “the shop has run out of change”), then step back as children take it further.' },
  { indicator: '3.3.4', prompt: 'You are reading a story and stop at a picture of a bear hiding. What do you most likely ask?',
    l1: '“What animal is this?”', l2: '“Why do you think the bear is hiding?” — and wait for answers.', l3: '“Why do you think so?” — then follow up on a child’s answer and invite others to respond to it.' },
  { indicator: '3.3.6', prompt: 'A child shows you a tower they built. What do you most likely say?',
    l1: '“Good job!”', l2: '“You used the big blocks at the bottom so it stays up.”', l3: '“You put the big blocks at the bottom. What would happen if you tried it the other way?”' },
  { indicator: '3.4.2', prompt: 'Children must wait their turn for the swing. What do you most likely do?',
    l1: 'Tell them to wait and take turns.', l2: 'Use a sand timer and remind them of it.', l3: 'Play a short waiting game the class knows, and let children manage the timer themselves.' },
  { indicator: '3.4.5', prompt: 'At the start of project time, what do you most likely do?',
    l1: 'Tell the children what they will do today.', l2: 'Help each child say or draw a simple plan.', l3: 'Children make their plans, check them during the session, and review them with a friend at the end.' },
];

/** Deterministic option shuffle so the "best" answer isn't always last. */
function rotate<T>(xs: T[], k: number) {
  const n = k % xs.length;
  return [...xs.slice(n), ...xs.slice(0, n)];
}

export function preschoolQuestions(): Question[] {
  const subdomains = QTT.domains.flatMap((d) => d.subdomains);
  const qs: Question[] = [];
  for (const sd of subdomains) {
    SCENARIOS.filter((s) => s.indicator.startsWith(`${sd.code}.`)).forEach((s, i) => {
      const options: ScenarioOption[] = [
        { id: 'a', text: s.l1, level: 1 },
        { id: 'b', text: s.l2, level: 2 },
        { id: 'c', text: s.l3, level: 3 },
      ];
      qs.push({ id: `sc-${s.indicator}`, type: 'scenario', subdomain: sd.code, indicator: s.indicator, prompt: s.prompt, options: rotate(options, (i + sd.code.length + Number(sd.code.replace('.', ''))) % 3) });
    });
    qs.push({ id: `self-${sd.code}`, type: 'self', subdomain: sd.code, prompt: `Which best describes your practice in “${sd.name}”?` });
    qs.push({ id: `conf-${sd.code}`, type: 'confidence', subdomain: sd.code, prompt: `How confident do you feel about “${sd.name}”?` });
  }
  return qs;
}

export const SUBDOMAIN_NAMES: Record<string, string> = Object.fromEntries([
  ...QTT.domains.flatMap((d) => d.subdomains).map((s) => [s.code, s.name]),
  ...EYDF_PRACTICES.map((p) => [p.code, p.name]),
]);

export const CONFIDENCE = [
  { value: 1, label: 'Still finding my feet' },
  { value: 2, label: 'Fairly confident' },
  { value: 3, label: 'Very confident' },
] as const;

/** Infant & toddler rooms (under 2): EYDF-aligned practices, self-rating + confidence (PRD rule 3). */
export function infantQuestions(): Question[] {
  return EYDF_PRACTICES.flatMap((p) => [
    { id: `self-${p.code}`, type: 'self' as const, subdomain: p.code, prompt: `Which best describes your practice in “${p.name}”?` },
    { id: `conf-${p.code}`, type: 'confidence' as const, subdomain: p.code, prompt: `How confident do you feel about “${p.name}”?` },
  ]);
}
