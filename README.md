<div align="center">

# 💰 Wallet

**Personal finance, on your own books.**

A self-hosted net-worth tracker. One monthly check-in. Your database, your rules.
No cloud middleman. No tracking. No freemium.

<br />

[Live landing →](https://wallet.huberty.pro) · [Documentation](#quick-start) · [Self-host in 2 min](#self-host)

<br />

[![License: MIT](https://img.shields.io/badge/license-MIT-15120D?style=flat-square)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Postgres](https://img.shields.io/badge/Postgres-16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![better-auth](https://img.shields.io/badge/better--auth-1.6-6366f1?style=flat-square)](https://better-auth.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## Why Wallet

Most personal-finance apps are built for their business model, not yours. They want bank
credentials, they sell anonymised data, they go offline when the company pivots. Wallet is
the opposite bet: a small, boring, complete app that you run yourself.

- **Your data stays on your server.** Postgres you control. No third party.
- **One monthly check-in.** Enter current values, close the page, done for the month.
- **Projection + history in one view.** See where you're going, with the data you already
  have.
- **Designed for real life.** DCA is editable, budgets aren't sacred, notes explain the
  numbers.

Not a SaaS. Not a startup. A tool.

## Features

| | |
|---|---|
| 🏦 **Multi-account**            | Bank, savings, brokerage, retirement, crypto, real estate, credits. Each with its own yield / contribution / appreciation. |
| 📆 **Unified monthly check-in** | Accounts, mortgage amortization (pre-filled), recurring expenses (avg / prev / this month), one-off charges and incomes with reusable templates, notes everywhere. |
| 📊 **History × Projection**     | Combined chart: snapshots + forward-projected per account (assets, liabilities, net). |
| 💸 **Flexible DCA**             | Every eligible account carries a DCA baseline — editable inline, never a rigid commitment. |
| 🏠 **Property & mortgage**      | Import amortization schedules (PDF or CSV). Capital repaid and interest auto-prefilled at check-in. |
| 📥 **Revolut CSV import**       | Parses the tax report to extract your ETFs (ticker + ISIN + name) — you set the `%` allocation. |
| 🔐 **Auth your way**            | Google OAuth or email / password via [better-auth](https://better-auth.com/). |
| 🗂 **Notes & templates**         | Any line (expense, income, charge, account) can be annotated. One-off items remember themselves as templates. |

## Screenshot tour

> Screenshots once a public demo / sample dataset is seeded. Help welcome — open a PR with
> anonymised GIFs.

## Stack

- **Framework** — Next.js 16 (App Router, Turbopack), React 19, TypeScript strict
- **Styling** — Tailwind CSS v4, Fraunces + Geist fonts, shadcn-style components on
  `@base-ui/react`
- **DB** — PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`)
- **Auth** — [better-auth](https://better-auth.com/) — Google OAuth + email / password
- **Charts** — Recharts
- **Forms** — react-hook-form + Zod
- **Deployment** — Coolify (self-hosted), or Vercel, or any Docker host

## Quick start

Requirements: Node 20+, Docker (for local Postgres), a Google OAuth Client (optional but
nice).

```bash
# Clone
git clone https://github.com/NicolasHuberty/wallet.git
cd wallet

# Install
npm install

# Local Postgres
docker compose up -d

# Environment
cp .env.example .env.local
# then fill in:
#   DATABASE_URL=postgres://wallet:wallet@localhost:5432/wallet
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#   BETTER_AUTH_URL=http://localhost:3000
#   NEXT_PUBLIC_AUTH_URL=http://localhost:3000
#   GOOGLE_CLIENT_ID=...            (optional)
#   GOOGLE_CLIENT_SECRET=...        (optional)

# Schema
npm run db:push

# Run
npm run dev
# → http://localhost:3000
```

Create an account (Google or email / password). A `household` is auto-created for you on
signup.

## Self-host

### With Docker Compose

A `docker-compose.yml` for Postgres is included. To run the whole stack in production,
build the Next.js image and link it to the Postgres service. Coolify, Dokku, CapRover,
and Railway all work well.

### With Coolify

1. Create a new project and environment in Coolify.
2. Add a **PostgreSQL** database resource.
3. Add an **Application** pointing to your fork of this repo. Build pack: Nixpacks.
4. Set these environment variables on the app:

   | Key                      | Value                                              |
   |--------------------------|----------------------------------------------------|
   | `DATABASE_URL`           | Internal Postgres URL (Coolify shows it)           |
   | `BETTER_AUTH_SECRET`     | `openssl rand -base64 32`                          |
   | `BETTER_AUTH_URL`        | `https://your-domain.tld`                          |
   | `NEXT_PUBLIC_AUTH_URL`   | `https://your-domain.tld`                          |
   | `GOOGLE_CLIENT_ID`       | From Google Cloud Console (OAuth 2.0 credentials)  |
   | `GOOGLE_CLIENT_SECRET`   | same                                               |

5. Configure your custom domain and enable TLS.
6. Deploy.

Google OAuth redirect URI (set in Google Cloud Console):

```
https://your-domain.tld/api/auth/callback/google
```

### First deploy note

Drizzle migrations are not applied automatically. After the first container starts,
open a shell on the app and run:

```bash
npm run db:push
```

Or configure a start-up script / init container in your platform of choice.

## Scripts

| Script | What |
|---|---|
| `npm run dev`         | Dev server (Turbopack) |
| `npm run build`       | Production build |
| `npm run start`       | Production server |
| `npm run lint`        | ESLint |
| `npm run db:push`     | Push schema to DB (dev) |
| `npm run db:generate` | Generate SQL migration |
| `npm run db:migrate`  | Apply migrations (prod) |
| `npm run db:studio`   | Drizzle Studio |

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Public landing (redirects to /dashboard if authed)
│   ├── landing.tsx               # Landing UI
│   ├── dashboard/                # Net-worth overview
│   ├── accounts/                 # List + detail with inline editing
│   ├── check-in/                 # Unified monthly check-in form
│   ├── investments/              # Wallets + allocations + Revolut import
│   ├── real-estate/              # Properties + mortgages + amortization
│   ├── expenses/                 # Recurring expenses & incomes
│   ├── charges/                  # One-off charges
│   ├── projections/              # Projection + Monte-Carlo
│   ├── snapshots/                # Net-worth history
│   ├── login/ signup/            # Auth pages
│   └── api/auth/[...all]/        # better-auth routes
├── components/                   # UI (shadcn-style)
├── db/
│   ├── schema.ts                 # Drizzle schema (all tables + better-auth)
│   └── index.ts                  # Lazy pg pool
└── lib/
    ├── auth.ts                   # better-auth config (Google + email)
    ├── auth-client.ts            # React auth hooks
    ├── queries.ts                # Household-scoped queries
    ├── projection.ts             # Per-account projection engine
    ├── monte-carlo.ts            # Stochastic simulation
    └── revolut.ts                # Revolut CSV parser
```

## Design philosophy

- **Edit anywhere.** Fields in lists should be editable inline, not behind modals.
- **No engagements.** DCA and budgets are suggestions, never locks.
- **Show the past, model the future.** Every account gets a history graph *and* a
  projection.
- **The database is the source of truth.** Re-derive everything from accounts + snapshots
  on every page load. No caches to invalidate.
- **French-first, locale-clean.** `fr-BE` formatting, `EUR` by default. Other locales can
  be added.

## Contributing

Contributions are welcome — this started as a personal weekend project and it has grown
nicely. Things that would help:

- **UI polish.** The check-in table on small screens, the projection controls, a
  dashboard mobile layout.
- **New parsers.** ING, Belfius, BNP Paribas Fortis, KBC — each bank's CSV exports.
- **i18n.** Currently FR-only strings. An extraction pass + English translations would
  unlock wider use.
- **Tests.** Nothing yet. Starting with a few Vitest cases on `projection.ts` and
  `revolut.ts` would be ideal.
- **Docs.** Screenshots, a GIF walkthrough, a Coolify one-click template.

### How to contribute

1. Fork the repo and create a feature branch: `git checkout -b feat/my-idea`.
2. Install deps: `npm install`.
3. Keep `npm run build` green and types strict. No any.
4. Write code in the same spirit as the rest — editorial clarity, tight Tailwind, minimal
   libraries.
5. Open a PR. Small PRs get merged fast.

No CLA, no contributor agreement. You keep your copyright; your contribution is MIT-licensed.

## Security

- Passwords are hashed by better-auth (Argon2).
- Secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, OAuth credentials) go in `.env.local` or
  your platform's env manager — never in the repo.
- **Backups are your responsibility.** Coolify's scheduled backups of the Postgres
  resource work, but test restoration yourself.
- Report security issues privately to `security@huberty.pro`.

## License

[MIT](./LICENSE). Use it, fork it, ship it.

## Credits

Built in Brussels by [@NicolasHuberty](https://github.com/NicolasHuberty).

Typography: [Fraunces](https://fonts.google.com/specimen/Fraunces),
[Geist](https://vercel.com/font). Icons: [lucide](https://lucide.dev).
Framework: [Next.js](https://nextjs.org/). Auth: [better-auth](https://better-auth.com/).

If Wallet helps you, a ⭐ on the repo is the best thank-you.
