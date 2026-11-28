# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Preschool educators in Singapore: teachers, lead teachers and educators across Nursery (N1, N2) and Kindergarten (K1, K2) classes at Agape Little Uni centres. They open Tend between classroom routines, often on a phone, sometimes on a centre desktop. Their job: understand the feedback from an observation, reflect on it, try one strategy tomorrow, and grow against a plan they agreed with their centre leader.

Other audiences, each with their own area: Centre Leaders and mentors (observe, review AI drafts, debrief, see centre insights and metrics), HQ Learning & Development (network view, framework registry, programmes), and IT admins (accounts).

## Product Purpose

Tend is an Educator Growth Studio built for the ECDA Innovation Sandbox (Call 30) with Agape Little Uni. It turns each classroom observation into same-day growth notes for preschool educators, with every note tied to evidence. A leader records an observation. An AI pipeline redacts child names, segments the transcript, tags moments against the QTT framework and drafts Glow / Grow / Next-step feedback that cites evidence. The leader reviews and approves it, and the educator reflects first, then reads it. Success: educators grow over time against an Individual Development Plan, and feedback feels like coaching, not appraisal.

## Positioning

Growth, not grading. Every feedback sentence links to the exact classroom moment it came from (evidence chips). A person never sees a score, average or rank, only developmental steps ("Seen at Level 2 · next: try Level 3"). AI drafts are always labelled and reviewed by a human before an educator sees them.

## Operating Context

- Observation cycle: the educator chooses what they'd like feedback on (focus), the leader observes and captures audio, the AI drafts, the leader reviews and approves, the educator reflects first and then reads the notes, the two debrief, and actions land in the educator's IDP.
- Needs analysis (LNA, about 12–15 min) suggests goals; the Growth Snapshot and IDP are confirmed by both the educator and the centre leader.
- "Try tomorrow" micro-coaching cards with a one-tap "Tried it"; an AI Coach chat; a private Reflect journal; Learn (courses, Peer Match).
- Peer Match: a colleague who was seen doing an indicator well can be asked to be watched for 15 minutes.
- Educators can ask their leader for an observation.

## Capabilities and Constraints

- Framework: QTT, with 46 indicators in three domains (1 Relationships, 2 Well-being, 3 Learning), plus IT and TRUE codes. A framework code is always shown together with its name.
- Levels L1–L3 are shown as stepping stones. Never use progress bars, percentages, scores or ranks for a person.
- Locales: English, 中文 and Bahasa Melayu (next-intl). Users can scale text up to 130%.
- Stack: Next.js 15 App Router, Tailwind v4, shadcn/ui, Supabase with RLS, Vercel AI SDK. Without an API key the app runs offline, and drafts are labelled "Drafted offline".
- Every empty screen shows one sentence and one action.
- Mobile is first-class: bottom bar on phones, side rail on desktop, 44px touch targets, no horizontal scroll.

## Brand Commitments

- Name: Tend. Tagline: "Growth, not grading".
- Voice: warm, calm, professional, plain words. Encouraging without hype.
- Every piece of AI content carries a label ("Drafted with AI · reviewed by …").

## Evidence on Hand

- Synthetic demo world only (`@demo.tend.sg` personas: Aisha, Lee Mei Ling, Farah, Ravi, Sandra, Daniel, Admin).
- Skills Framework codes and course titles are labelled samples pending Agape's data. Level descriptors and look-fors are Tend drafts pending curriculum review.
- No real testimonials, outcomes or metrics exist. Do not fabricate any.

## Product Principles

1. Growth, not grading: show steps and next moves, never judgement.
2. Evidence over opinion: every claim traces back to a real classroom moment.
3. Reflect first: the educator's own voice comes before the feedback.
4. One next step: always make the single most useful action obvious.
5. Humans approve AI: drafts are visible as drafts, and people own the decisions.

## Accessibility & Inclusion

WCAG 2.2 AA (axe in E2E). Colour is never the only signal. Text scales to 130%. Reduced motion is respected. Multilingual, including CJK.
