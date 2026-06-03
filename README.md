# 💸 Splitwise — "Show me the money!"

A self-hosted Splitwise clone: split shared expenses, see who owes whom, and
settle up. Built with **Next.js (App Router)**, **Neon Postgres**, and
**Tailwind CSS**. Dark theme only.

## Features

- **Groups** — organize expenses by trip, apartment, etc.
- **Expenses** — split **equally**, by **exact amounts**, or by **percentage**.
- **Balances** — running net of who owes whom, per person.
- **Settle up** — record repayments; balances update instantly.
- **Debt simplification** — suggests the fewest payments to get everyone square.
- **Lightweight auth** — one **group code** you hand out. People register with
  the code + their name. Login persists via an HttpOnly cookie (plus a
  localStorage backup). If a browser is wiped, re-entering the **same code +
  name** logs back into the *same* profile — no history lost.

## Auth model (how "me and my boys" log in)

- You set a single `GROUP_CODE` (in env vars) and share it with your friends.
- Each person registers by entering the **group code + their name**.
- The name is the identity (case-insensitive). Re-registering with the same
  name + code is a **recovery** — it logs into the existing profile rather than
  creating a duplicate. So losing cookies/localStorage costs nothing.
- There are no per-user passwords; the group code is the gate.

> Want stronger auth later? Add a per-member password column and check it in
> `registerOrRecover()` — the rest of the app doesn't change.

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure env vars.** Copy `.env.example` to `.env` and fill in your Neon
   connection string + secrets:

   ```bash
   cp .env.example .env
   ```

   - `DATABASE_URL` — your Neon **pooled** connection string.
   - `DATABASE_URL_UNPOOLED` — the **direct** string (used by `db:init`).
   - `GROUP_CODE` — the code you hand out to friends.
   - `AUTH_SECRET` — generate with `openssl rand -hex 32`.

3. **Create the database tables**

   ```bash
   npm run db:init
   ```

4. **Run it**

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>, enter your group code + name, and you're in.

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. In the Vercel dashboard, add a **Neon** database (Storage tab). Vercel injects
   `DATABASE_URL` and the related env vars automatically.
3. Add `GROUP_CODE` and `AUTH_SECRET` as Environment Variables.
4. Run the schema once against your production DB. Either:
   - locally: `vercel env pull .env && npm run db:init`, or
   - paste the contents of `src/lib/schema.sql` into the Neon SQL editor.
5. Deploy. Share the URL + group code with your boys.

## How the money math works

- All amounts are stored as **integer cents** — no floating-point drift.
- Each expense records the **payer** and a row per participant in
  `expense_shares` (their portion). The split is validated server-side so shares
  always sum to the total.
- A member's **net** = (what they paid) − (their shares) + (settlements they
  paid) − (settlements they received). The sum of all nets is always zero.
- **Simplification** uses a greedy min-cash-flow pass (largest creditor ↔
  largest debtor) to suggest a small set of transfers.

See [`src/lib/balances.ts`](src/lib/balances.ts) for the implementation.

## Project layout

```
src/
  app/
    api/                 # route handlers (auth, groups, expenses, settlements)
    groups/[id]/page.tsx # group detail: balances, activity, settle up
    page.tsx             # home: your groups + login gate
    layout.tsx, globals.css
  components/            # AuthProvider, modals, TopBar, LoginScreen, ...
  lib/
    auth.ts              # group-code + name register/recover, signed tokens
    balances.ts          # net balances, debt simplification, split helpers
    db.ts                # Neon serverless client (DATABASE_URL)
    queries.ts           # shared reads (members, expenses, settlements)
    money.ts, types.ts, schema.sql
scripts/init-db.ts       # one-shot schema bootstrap (npm run db:init)
```
