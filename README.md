# Tend — Educator Growth Studio

Growth, not grading. Tend turns every classroom observation into same-day, evidence-linked growth for preschool educators (ECDA Innovation Sandbox Call 30 · Agape Little Uni).

## Run it locally

Requires Node 20+, pnpm, and Docker Desktop (for local Supabase).

```bash
pnpm install
pnpm db:start            # local Supabase in Docker (ports 55321–55329)
pnpm db:reset            # apply migrations + load the synthetic demo world
pnpm dev                 # http://localhost:3000
```

`.env.local` holds the well-known local Supabase keys and `DEMO_MODE=1`, which adds a **persona switcher** on the sign-in page (synthetic `@demo.tend.sg` accounts only):

| Persona | Role | Lands on |
|---|---|---|
| Sandra Tan | Centre Leader, Punggol | Today |
| Aisha binte Rahman | K1 Preschool Teacher | Home |
| Lee Mei Ling | N1 Educator (中文, 130% text, no plan yet) | Home |
| Farah Ismail | K2 Lead Teacher (Peer Match) | Home |
| Ravi Kumar | N2 Teacher, first year | Home |
| Daniel Koh | HQ L&D | Network |
| Agape IT Admin | Admin | Admin |

### AI: GPT-6 Luna

Set `OPENAI_API_KEY` in `.env.local` and restart. Every AI step routes through `lib/ai/gateway.ts` (model per task in `lib/ai/models.ts`; override one task with e.g. `AI_MODEL_FEEDBACK_WRITE=gpt-6-sol`). Every call is logged to `ai_run` with tokens, cost and region. Check the key with `pnpm ai:smoke`.

**Without a key, Tend runs fully in offline mode**: deterministic rule-based segmenting, tagging (BM25 over the QTT registry), cited drafting, Tone Guard, coaching cards and coach replies. Drafts are labelled "Drafted offline". Live audio transcription needs the key; until then leaders type or use keyboard dictation (or the demo dictation button).

> Residency: Singapore in-region inference for GPT-6 Luna is **not yet confirmed** (PRD Q4). The demo uses synthetic data only.

## The 5-minute demo path

1. **Aisha** → Home → *Choose what I'd like feedback on* → pick 3.3.4.
2. **Sandra** → Observe → Aisha · K1 story time → pre-brief → *Start* → *Play demo dictation* → ★ → *End*.
3. Review: evidence beside the draft, child names redacted, tap an evidence chip, try typing "failed" (Tone Guard) → *Approve & share*.
4. **Aisha** → *New growth notes* → reflect first → read, agree/add context, 👍, *Tried it*; Learn → Peer Match (Farah); Coach → "my K1s go quiet…".
5. **Sandra** → Reviews → debrief (agenda from Aisha's reflection) → action lands in her IDP; Insights (3.4 gap, 2.1.3 blind spot, learning group); Metrics (7 KPIs, CSV).
6. **Daniel** → Network (groups ≥ 5), Registry, Programmes.

## Tests

```bash
pnpm check      # typecheck + lint + unit/DB tests (Vitest; DB tests run on PGlite with the real migrations)
pnpm e2e        # Playwright against local Supabase: desktop, then phone (resets the DB first)
```

- **Security (RLS) tests** attack every rule: other org/centre, educator-as-leader, direct writes, approval gate, reflect-first, private reflections, append-only audit log.
- **Pipeline tests** cover redaction, segmentation, retrieval, shortlist-only tagging, citation enforcement, Tone Guard and a mocked GPT-6 Luna run.
- **E2E** covers every PRD journey including the full hero journey on desktop and phone, with axe (WCAG 2.2 AA) scans and no-horizontal-scroll checks.

## Architecture

Next.js 15 · TypeScript · Tailwind v4 · shadcn/ui · next-intl (en, 中文) · Supabase (Postgres + RLS + pgvector + Storage) · Vercel AI SDK.

- `supabase/migrations` — schema, RLS, approval gate & feature functions (all state changes via `SECURITY DEFINER` functions).
- `supabase/seed` — QTT framework (46 indicators), registry, deterministic synthetic world.
- `lib/pipeline` — the 11-step AI pipeline (offline + Luna), `lib/coach` — guardrails + coach, `lib/ranking` — pathway formula.
- `app/[locale]/(educator|leader|hq|admin)` — role areas; `app/api` — capture upload, pipeline trigger, coach, media, metrics.

## Known gaps (pilot work)

- Chinese covers the shell, sign-in, levels and core labels; page copy and LNA scenarios are English.
- Malay/Tamil, SSO + MFA, framework upload/compare/re-map, batch review, nudges, ambient recording, Practice Studio and the help assistant are P1.
- Skills Framework codes and course titles are labelled samples pending Agape's data (PRD Q2, Q9). Level descriptors and look-fors are Tend drafts pending curriculum review.
