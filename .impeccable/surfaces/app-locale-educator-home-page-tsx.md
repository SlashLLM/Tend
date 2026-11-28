---
version: 1
slug: "app-locale-educator-home-page-tsx"
primary_target: "app/[locale]/(educator)/home/page.tsx"
related_targets: []
---

# Educator Home (/home)

Scope: the educator landing page after sign-in, used by every educator persona (with or without a plan, in en/zh/ms, at 100–130% text). Visitor mode: Operate.

Audience and job: a preschool educator opening Tend between routines, often on a phone. Job: see at a glance what is waiting from real people (growth notes, peer requests, an upcoming observation, a coaching card), answer each with one action, and keep sight of their goals.

Constraints: keep Tend's existing world (paper, deep teal, amber, Figtree/Noto Sans, soft cards). Keep every existing action and state: reflect-first notes, focus choice, peer accept/decline with time and reply, peer sessions, request/withdraw an observation, Try-tomorrow with Tried it, goals with stones. No scores. One sentence and one action on empty states.

## Direction contract

THESIS: Home is a letterbox. Everything waiting reads as a letter from a named person, with a sender, a postmark and one reply. It refuses the dashboard of status cards.

OWN-WORLD: warm paper ground with white envelope cards. A teal top edge marks unread letters. Each sender has a round initials avatar in a Tend palette colour. A dashed circular postmark, tilted slightly, shows day, date and time in Figtree. Amber highlighter on the coaching line. Domain-tinted indicator tags and stepping stones in the goals column.

STORY: the educator sees who wrote and why, reflects or replies in place, writes to their leader to ask for an observation, and leaves knowing their goals.

FIRST VIEWPORT: dateline, then "Hi Aisha" at 40px with a summary sentence naming the senders. A single column of letters, newest action first; the first letter's primary button (Reflect first) is the main action. A 320px right column holds My goals and Earlier letters. On phones it is one column and goals follow the letters.

FORM: letterbox feed, position 6 of 7 on the ranked list, seed:844fc4354cc6c3c3. Signature move: postmark stamps plus letters arriving in a short stagger.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
