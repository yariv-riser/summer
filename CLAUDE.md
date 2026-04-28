@AGENTS.md

# CLAUDE.md

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

Whenever working with any third-party library or something similar, you MUST look up the official documentation to ensure that you're working with up-to-date information. 

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Project state

This repo is a freshly-scaffolded Next.js app. The intended product is described in `SPEC.md` ("Summer" — a one-click Gmail receipt-summary app). Most of `SPEC.md` is **not implemented yet**: the only application code currently is the Create-Next-App boilerplate in `app/`. Treat `SPEC.md` as the authoritative design for new features; do not assume any of its modules already exist — check before importing from `@/lib/*`.

## Commands

Bun is the package manager (`bun.lock` is the lockfile of record; `package-lock.json` is stale and should be ignored — do not run npm/yarn/pnpm).

- `bun install` — install dependencies
- `bun run dev` — Next dev server (http://localhost:3000)
- `bun run build` — production build
- `bun run start` — serve the production build
- `bun run lint` — ESLint (flat config, `eslint-config-next/core-web-vitals`)

There is no test runner configured yet.

## Stack and conventions

- **Next.js 16.2.4 (App Router), React 19.2** — versions ahead of most training data. Read `node_modules/next/dist/docs/01-app/**` before using framework APIs; verify deprecation notices.
- **JavaScript only, no TypeScript.** `jsconfig.json` defines the `@/*` path alias rooted at the repo.
- **React Compiler is enabled** (`next.config.mjs` → `reactCompiler: true`, `babel-plugin-react-compiler` in devDeps). Don't hand-write `useMemo`/`useCallback` for things the compiler will memoize; don't fight it with patterns that defeat its analysis (mutating props, etc.).
- **CSS Modules, bracket notation, kebab-case class names, nested selectors** — per `SPEC.md` §12. Example: `styles['submit-button']`, not `styles.submitButton`. Apply this to any new component CSS.
- **No application-data persistence.** Per spec, every summary run is computed from scratch; the only DB tables are those better-auth requires. Don't add a "receipts" table or similar without explicit direction.

## Planned architecture (per SPEC.md)

When implementing, the pipeline is a five-step linear flow split across two API routes so the user-facing request returns fast:

1. `POST /api/summary/generate` — validates session, enqueues a QStash job, returns 200 immediately.
2. QStash invokes `POST /api/summary/process` (signature-verified) which runs `lib/pipeline.js`: refresh Google token → list Gmail `category:purchases` → extract receipts (schema.org pre-pass + Gemini fallback) → convert FX to ILS → render bilingual RTL HTML email → send via `gmail.users.messages.send` to the user's own inbox.

Key load-bearing details:
- Google OAuth must use `access_type=offline` + `prompt=consent` so a refresh token is actually issued.
- Worker needs `export const maxDuration = 60` (Vercel Pro); the default 10s won't fit.
- LLM extraction uses Gemini Flash-Lite (`gemini-2.5-flash-lite`) on the free tier — **15 RPM hard ceiling**. `lib/extract.js` runs a schema.org JSON-LD pre-pass (free, no API call) and only falls back to the LLM for emails without structured markup. Even with the pre-pass, large batches won't fit in one 60s worker invocation; `lib/pipeline.js` will need to chunk and re-enqueue itself via QStash with a cursor.
- FX rates are cached per-day in-memory for the run; ILS is the base.
- Email is bilingual Hebrew/English, RTL, table-based layout, inline CSS only (clients strip `<style>`); wrap currency amounts in `<bdi>`.

Refer to `SPEC.md` for prompts, env-var list, file layout under `lib/`, and the suggested build order.
