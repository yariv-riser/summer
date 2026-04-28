# Summer — Technical Specification

**Working title:** Summer
**Status:** v1 MVP spec
**Owner:** Yariv (Riser)

---

## 1. Overview

Summer is a single-purpose web app: an authenticated user clicks one button, and a few minutes later a structured summary of all the receipts in their Gmail inbox arrives in that same inbox.

**v1 scope (this spec):**

- Google sign-in only, with Gmail read + send access granted at sign-up.
- One dashboard screen with a time-window selector and a single "generate" button.
- Async (fire-and-forget) generation: clicking returns immediately; the email arrives a few minutes later.
- Bilingual (Hebrew/English), RTL-aware HTML email containing: receipt list, total spend, breakdown by merchant, breakdown by category — all amounts converted to ILS.
- LLM-based receipt detection and structured extraction via the Anthropic API.
- No persistent application data — every run is computed from scratch.

**Out of scope for v1:**

- Charts/visualizations in the email (text + tables only).
- Scheduled / recurring summaries.
- Multi-provider email (Outlook, IMAP, etc.).
- Caching extracted receipts.
- In-app summary history.
- Billing / quotas.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | JS only, no TypeScript |
| Runtime / package manager | Bun | `bun install`, `bun run dev` |
| UI | React (server + client components) | |
| Styling | Vanilla CSS Modules | Nested selectors. Imports use bracket notation: `styles['button-primary']`. |
| Authentication | better-auth | Google provider only |
| Database | Supabase Postgres | Auth-only schema. No application tables. |
| LLM | Google Gemini API (`@google/genai`) | Gemini 2.5 Flash-Lite (`gemini-2.5-flash-lite`) on the free tier — 15 RPM, 1000 RPD |
| Background jobs | Upstash QStash | Fire-and-forget HTTP queue with retries |
| Currency FX | exchangerate.host | Free, no API key |
| Email send | Gmail API (`users.messages.send`) | Sends from the user's account to themselves |
| Hosting | Vercel | Pro plan recommended for the worker function timeout |

---

## 3. Architecture Overview

The control flow is a five-step linear pipeline:

1. The browser dashboard issues `POST /api/summary/generate` when the user clicks **Generate**.
2. That endpoint validates the session, builds a job payload, and enqueues it on QStash. It returns 200 immediately with a "we'll email you" UX state.
3. QStash holds the job and POSTs it to the worker endpoint, retrying on failure.
4. `POST /api/summary/process` is the worker. It refreshes the user's Google access token, lists receipt-candidate messages from Gmail, extracts structured data via Claude, converts amounts to ILS, renders the email, and sends it back through Gmail.
5. The user receives the summary email in the same inbox they granted access to.

The pattern matters: the user-facing `/generate` request finishes in well under a second. All slow work (LLM calls, Gmail round-trips) happens in the worker, which runs under its own Vercel function lifecycle without the user waiting.

---

## 4. Authentication & OAuth

### Provider

Google only. No email/password, no magic links.

### Scopes requested at sign-up

```
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

### OAuth parameters

A refresh token is required, since access tokens expire after 1 hour and the worker may run long after the user has closed the tab. The OAuth request must include:

- `access_type=offline`
- `prompt=consent` — forces re-consent so a refresh token is actually issued. Without this, repeat sign-ins won't get one.

### better-auth setup (`lib/auth.js`)

```js
import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      accessType: 'offline',
      prompt: 'consent',
    },
  },
});
```

### Refresh token flow (`lib/google-auth.js`)

When the worker runs, the stored access token may have expired. A helper checks expiry and refreshes via Google's token endpoint, persisting the new token + expiry back to the account record. Verify the exact better-auth API names against current docs at build time, since the library is evolving.

```js
import { auth } from './auth.js';

export async function getValidAccessToken(userId) {
  const account = await auth.api.getAccount({
    userId,
    providerId: 'google',
  });

  if (
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt > Date.now() + 60_000
  ) {
    return account.accessToken;
  }

  const refreshed = await auth.api.refreshAccessToken({
    accountId: account.id,
    providerId: 'google',
  });
  return refreshed.accessToken;
}
```

---

## 5. Data Model

Per the design constraint, **no application data is persisted**. The only tables in Postgres are those better-auth requires:

- `user` — id, email, name, image, timestamps
- `session` — id, userId, token, expiresAt, ipAddress, userAgent
- `account` — id, userId, providerId, providerAccountId, accessToken, refreshToken, accessTokenExpiresAt, scope
- `verification` — created automatically; not used (no email verification flow)

Schema is generated by better-auth's CLI:

```bash
bunx @better-auth/cli generate
bunx @better-auth/cli migrate
```

Connection: standard `pg` Pool against the Supabase Postgres connection string.

---

## 6. Background Job Pipeline

### Why QStash

Vercel functions on the Hobby plan have a 10-second max duration; Pro raises that to 60 seconds. A receipt-summary run may exceed 60s on inboxes with many candidates. QStash decouples the request from the work: the user-facing route enqueues a message, and QStash invokes a separate function endpoint that runs to completion under its own duration limit. It also gives us free retries.

### Enqueue — `app/api/summary/generate/route.js`

```js
import { Client } from '@upstash/qstash';
import { auth } from '@/lib/auth';

const qstash = new Client({ token: process.env.QSTASH_TOKEN });

export async function POST(req) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { from, to } = await req.json();

  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/summary/process`,
    body: { userId: session.user.id, from, to },
    retries: 2,
  });

  return Response.json({ status: 'queued' });
}
```

### Worker — `app/api/summary/process/route.js`

```js
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { runPipeline } from '@/lib/pipeline';

async function handler(req) {
  const { userId, from, to } = await req.json();
  await runPipeline({ userId, from, to });
  return Response.json({ status: 'done' });
}

export const POST = verifySignatureAppRouter(handler);
export const maxDuration = 60;
```

Signature verification ensures the route is only callable by QStash, not the public web. The worker itself is a regular Next.js route handler — no special infra.

---

## 7. Receipt Fetching (Gmail API)

### Listing candidates

Gmail auto-categorizes purchase confirmations into a "Purchases" category. We use that as a coarse filter:

```js
const query = `category:purchases after:${fromUnix} before:${toUnix}`;
const list = await gmail.users.messages.list({
  userId: 'me',
  q: query,
  maxResults: 200,
});
```

Date parameters are unix seconds for Gmail's `after:`/`before:` operators.

### Fetching content

For each candidate ID, fetch the full message, decode the `text/plain` MIME part if present (otherwise strip HTML from `text/html`), and truncate to ~4000 characters before passing to the LLM.

```js
const msg = await gmail.users.messages.get({
  userId: 'me',
  id,
  format: 'full',
});
```

### Caps

For v1, hard-cap at 200 messages per run. This protects against runaway LLM cost on inboxes with thousands of order confirmations.

---

## 8. LLM Extraction

### Model

`gemini-2.5-flash-lite` via `@google/genai` — Google's free-tier model. Sufficient for structured JSON extraction. **Free-tier limits: 15 RPM, 1000 RPD, shared 250k TPM across all models in the project** (resets midnight Pacific).

### Schema.org pre-pass (cost saver)

Before calling the LLM, `lib/extract.js` looks for schema.org JSON-LD in the email's `text/html` part. Most large senders (Amazon, Apple, App Store, Uber, airlines, App Store, hotels, etc.) embed `Order` / `Invoice` / `ParcelDelivery` / `*Reservation` markup — that's the same data Gmail itself reads to populate the Purchases category. When present, we extract `merchant`, `amount`, `currency`, `date` directly and skip the LLM call. The LLM is only used for emails without structured markup.

### Throughput / chunking

15 RPM means at most ~14 LLM-fallback emails per minute. A single 60s Vercel worker invocation can therefore handle ~14 LLM calls. The pipeline must chunk: process up to N candidates, persist a cursor, and re-enqueue itself on QStash if more remain. The schema.org pre-pass has no per-call cost and runs for all candidates synchronously.

### Prompt strategy

System prompt:

```
You extract structured receipt data from email content. Given an email's
subject, sender, and body text, return JSON with this exact shape:

{
  "is_receipt": boolean,
  "merchant": string | null,
  "amount": number | null,
  "currency": string | null,        // ISO 4217 code (ILS, USD, EUR, etc.)
  "date": string | null,            // YYYY-MM-DD
  "category": string | null         // free-form, e.g. "Food & Drink", "Transport", "Subscription"
}

Rules:
- If the email is not a receipt or order confirmation, set is_receipt to
  false and all other fields to null.
- Prefer the date the purchase was made over the email send date.
- Currency must be a 3-letter ISO code; infer from symbols (₪→ILS, $→USD).
- Pick a short, generic category. Re-use the same label for similar
  purchases across the batch (e.g., always "Food & Drink", not sometimes
  "Restaurant").

Output only valid JSON. No prose.
```

User message: the email's headers + truncated body.

### Concurrency

Serialized with a ~4.5s gap between calls to stay under the 15 RPM ceiling. Concurrency does not help here — RPM is the bottleneck, not throughput. The pipeline chunks across worker invocations as described above.

### Parsing

Wrap each call in a try/catch; treat parse failures as "not a receipt." A single bad email should never fail the run.

### Category normalization

Because categories are LLM-inferred and free-form, lightly post-process: lowercase, trim, fold near-synonyms into a small canonical set (e.g., "restaurant"/"cafe"/"food"/"dining" → "Food & Drink"). Done with a static lookup table — not another LLM call.

---

## 9. Currency Conversion

All non-ILS amounts are converted to ILS at the rate effective on the receipt date.

### Provider

`exchangerate.host` — free, no API key, supports historical rates:

```
GET https://api.exchangerate.host/{YYYY-MM-DD}?base=ILS&symbols=USD,EUR,GBP
```

### Strategy

1. Group extracted receipts by date.
2. For each unique date, fetch that day's ILS-base rates once (cache in-memory for the run).
3. For each receipt, convert: `amountInILS = amount / rate[currency]`.
4. Keep both the original (`amount`, `currency`) and converted (`amount_ils`) values on the in-memory receipt object — the email shows both.

If a rate fetch fails, fall back to the most recent successful rate; if none is available, mark the receipt as "(unconverted)" in the email.

---

## 10. Summary Email

### Channel

Sent via the user's own Gmail account (`gmail.send` scope), addressed to themselves. Sender = recipient = the signed-in user. No third-party email service.

### Construction

Build an RFC 2822 message string:

```
From: <user's email>
To: <user's email>
Subject: סיכום קבלות / Summary of receipts — {{from}} to {{to}}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8

<HTML body>
```

Base64url-encode the entire string and POST to `users.messages.send` with the `raw` parameter.

### Bilingual / RTL layout

Email clients are notoriously inconsistent with RTL. The reliable approach:

- Outer `<html dir="rtl" lang="he">` for the document.
- For the English block, override with `<div dir="ltr" lang="en">` on its container.
- Use a table-based layout — Outlook still requires it.
- Numbers may render LTR even in RTL contexts; wrap currency amounts in `<bdi>` to prevent flipping.

### Template structure

Top to bottom:

1. **Header band** — "Summer" wordmark on `#ffbf03` background.
2. **Bilingual title** — Hebrew above, English below.
3. **Date range** — `X באפריל – Y באפריל 2026` / `April X – April Y, 2026`.
4. **Totals card** — total ILS spend (large), number of receipts.
5. **Top merchants** — table, top 10 by spend.
6. **Category breakdown** — table, sorted by share of total.
7. **Receipt list** — table; columns: date, merchant, category, amount (original), amount (ILS).
8. **Footer** — small print, "Generated by Summer at <timestamp>."

### Styling

Inline CSS only (email clients strip `<style>`). Brand:

- `#111` — body text
- `#ffbf03` — primary accent (header band, totals card)
- `#0470c1` — secondary accent (links, table headers)

---

## 11. API Routes

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/auth/[...all]` | GET / POST | better-auth handler (sign-in, callback, signout, session) | n/a |
| `/api/summary/generate` | POST | Validate session + enqueue QStash job | Session cookie |
| `/api/summary/process` | POST | QStash worker — runs the full pipeline | QStash signature |

---

## 12. UI Routes & Components

### Routes

- `/` — minimal landing; redirects to `/dashboard` if signed in.
- `/sign-in` — Google sign-in button.
- `/dashboard` — the only meaningful screen: time-window picker, generate button, post-click confirmation state.

### Time-window UX

A presets row (chips: **Last 7 days** / **Last 30 days** / **Last 90 days**) plus a "Custom range" link that reveals two `<input type="date">` fields. Whichever is filled last wins. Default selection: **Last 30 days**. The form posts `{ from, to }` as ISO date strings.

### CSS Modules convention

Always import with bracket notation, kebab-case class names, nested selectors:

```js
// components/summary-form/index.js
'use client';
import styles from './summary-form.module.css';

export default function SummaryForm() {
  return (
    <form className={styles['form']}>
      <button className={styles['submit-button']} type="button">
        Generate summary
      </button>
    </form>
  );
}
```

```css
/* components/summary-form/summary-form.module.css */
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  & .submit-button {
    background: #ffbf03;
    color: #111;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;

    &:hover {
      opacity: 0.9;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
```

### Accessibility

- All form controls have associated `<label>` elements.
- The Generate button shows a clear loading/queued state; an `aria-live="polite"` region announces "Your summary is on the way."
- Color contrast: `#ffbf03` on `#111` and `#0470c1` on `#f5f5f5` both pass WCAG AA. Verify any new pairs introduced in build.
- Focus rings preserved (don't `outline: none` without a replacement).

### SEO

- `app/layout.js` defines `metadata` with title, description, OG image.
- `robots.txt` allows indexing of `/`, disallows `/dashboard` and `/api`.
- The landing page should be statically rendered.

---

## 13. Environment Variables

```bash
# Auth
BETTER_AUTH_SECRET=          # 32+ random chars
BETTER_AUTH_URL=             # e.g. https://summer.app
NEXT_PUBLIC_APP_URL=         # same as above; used for client + worker callback URL

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Database (Supabase Postgres)
DATABASE_URL=                # postgres://...

# Gemini (free tier — https://aistudio.google.com/apikey)
GEMINI_API_KEY=

# QStash
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
```

Local development uses `.env.local`; production uses Vercel-managed env vars.

---

## 14. Project Structure

```
summer/
├── app/
│   ├── api/
│   │   ├── auth/[...all]/route.js
│   │   └── summary/
│   │       ├── generate/route.js
│   │       └── process/route.js
│   ├── (auth)/
│   │   └── sign-in/
│   │       ├── page.js
│   │       └── page.module.css
│   ├── (app)/
│   │   └── dashboard/
│   │       ├── page.js
│   │       └── page.module.css
│   ├── layout.js
│   ├── layout.module.css
│   └── page.js
├── components/
│   ├── summary-form/
│   │   ├── index.js
│   │   └── summary-form.module.css
│   └── …
├── lib/
│   ├── auth.js               # better-auth config
│   ├── db.js                 # pg pool
│   ├── google-auth.js        # access-token refresh helper
│   ├── gmail.js              # list/get/send wrappers
│   ├── extract.js            # LLM extraction
│   ├── fx.js                 # currency conversion
│   ├── email-template.js     # bilingual RTL HTML builder
│   ├── pipeline.js           # the worker's runPipeline()
│   └── qstash.js             # client + signature helpers
├── styles/
│   └── globals.css
├── public/
│   └── logo.svg
├── bun.lockb
├── next.config.mjs
├── package.json
└── .env.local
```

---

## 15. Deployment (Vercel)

1. Create the project on Vercel, link the GitHub repo.
2. Set all env vars in the Vercel dashboard (Production + Preview).
3. In Google Cloud Console, register the OAuth client:
   - Authorized JavaScript origins: `https://summer.<domain>`, `http://localhost:3000`
   - Authorized redirect URIs: `https://summer.<domain>/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`
4. In Supabase, run `bunx @better-auth/cli migrate` against the production database (or run locally with `DATABASE_URL` pointing at Supabase).
5. In Upstash, create a QStash project; copy the token + signing keys to Vercel env.
6. Set `maxDuration = 60` on `/api/summary/process` (requires Pro). On Hobby's 10-second limit, the worker won't finish — either upgrade to Pro or implement chunked processing where the worker re-enqueues itself with a cursor after each chunk. **Pro is recommended for v1.**

---

## 16. Build Order

A suggested sequence that keeps each stage independently testable:

1. **Skeleton.** Next.js + Bun project, base layout, sign-in / dashboard routes (static, no auth yet).
2. **Auth.** better-auth + Supabase, Google OAuth with all scopes, verify session works.
3. **Token refresh.** `getValidAccessToken` helper; manually verify a refreshed token successfully calls `gmail.users.getProfile`.
4. **Gmail fetch.** `lib/gmail.js` — list + get; log decoded email bodies for a small range.
5. **LLM extraction.** `lib/extract.js` — single-message extraction first, then concurrent batch.
6. **FX.** `lib/fx.js` — historical rates with per-day caching.
7. **Email template.** `lib/email-template.js` — render to file locally, open in browser, iterate on RTL layout.
8. **Gmail send.** Wire in `users.messages.send`; verify a test summary lands in inbox.
9. **Pipeline glue.** `lib/pipeline.js` — wires fetch → extract → fx → template → send. Run synchronously from a script first (`bun run scripts/test-pipeline.js`) before involving QStash.
10. **QStash.** `/api/summary/generate` and `/api/summary/process`; signature verification.
11. **Dashboard UX.** Time-window picker, generate button, post-click confirmation state.
12. **Deploy.**

---

## 17. v2 Considerations (out of scope, but worth flagging)

- **Caching extracted receipts.** Single biggest cost / time win. A `receipt` table keyed on (`userId`, `messageId`) means subsequent runs only process new emails.
- **Charts in email.** Become much easier if you persist summary runs and host static PNG renders via a `/api/chart/[id].png` route — addressable by ID.
- **Vision-capable model.** If you want to handle scanned PDF receipts attached to emails, route those through a vision-capable model (Gemini Flash itself supports images, or swap to a paid Claude/GPT vision model) on the relevant subset.
- **Recurring summaries.** Vercel Cron + a per-user schedule field.
- **Per-user rate limiting.** Once this stops being a personal project.