# Wallet — Personal Finance Tracker

Suivi de patrimoine pour particuliers et ménages : comptes bancaires, DCA, check-in mensuel, projections long terme, immobilier, crédits, ETF.

## Project Overview

Wallet est une webapp Next.js qui permet à un utilisateur (connecté via Google ou email/mot de passe) de :
- Suivre la valeur de ses comptes (épargne, brokerage, immobilier, crédits, crypto…)
- Saisir un check-in mensuel unique couvrant tous les postes financiers
- Définir des DCA (apports mensuels) avec rendement annuel estimé
- Voir l'historique (par compte et patrimoine net global) + projections futures
- Enregistrer dépenses récurrentes, revenus exceptionnels, frais one-shot avec notes et modèles réutilisables
- Importer la liste d'ETF d'un portefeuille Revolut

Public = cercle privé (NOT a commercial product). Un seul utilisateur connecté = un seul household.

## Architecture

```
wallet/
├── src/
│   ├── app/                # Next.js 16 App Router pages
│   │   ├── accounts/       # Liste + détail + édition comptes
│   │   ├── check-in/       # Mise à jour mensuelle unifiée
│   │   ├── investments/    # Wallets + allocations ETF + import Revolut
│   │   ├── real-estate/    # Biens immobiliers + prêts + amortissement
│   │   ├── expenses/       # Dépenses/revenus récurrents
│   │   ├── charges/        # Frais one-shot
│   │   ├── projections/    # Projection patrimoine + Monte-Carlo
│   │   ├── snapshots/      # Historique patrimoine net
│   │   ├── api/auth/       # better-auth routes
│   │   └── ...
│   ├── db/                 # Drizzle schema + client
│   ├── lib/                # Queries, projection, CSV Revolut, etc.
│   └── components/         # UI (shadcn-style)
├── drizzle/                # Migrations SQL (Postgres)
└── public/
```

## Stack

- **Framework** : Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Styling** : Tailwind CSS v4, @base-ui/react
- **Auth** : better-auth (Google OAuth + email/password)
- **DB** : PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`)
- **Charts** : Recharts
- **Forms** : react-hook-form + zod
- **Icons** : lucide-react

## Deployment — Coolify

Mutualisé avec le serveur Coolify existant (`51.254.135.130`). Voir `.coolify.env` (gitignoré) pour la clé API et détails de déploiement.

- **FQDN prod** : https://wallet.huberty.pro
- **Repo GitHub** : https://github.com/NicolasHuberty/wallet (public)
- **Env unique** : `prod` (pas de dev séparé)
- **DB** : Postgres dédié Coolify (backup automatique activé)
- **Auto-deploy** : webhook GitHub déclenche un deploy Coolify sur push `main`

### Secrets nécessaires en env vars Coolify

| Clé | Description |
|---|---|
| `DATABASE_URL` | URL interne Postgres (fournie par Coolify) |
| `BETTER_AUTH_SECRET` | Secret random 32+ char (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `https://wallet.huberty.pro` |
| `GOOGLE_CLIENT_ID` | OAuth Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth Google Cloud Console |

Redirect URI Google OAuth : `https://wallet.huberty.pro/api/auth/callback/google`

## Database

Un seul schéma Drizzle dans `src/db/schema.ts`. Toutes les tables métier (account, holding, recurring_expense, one_off_charge, mortgage, net_worth_snapshot, …) + tables better-auth (user, session, account, verification).

Chaque `household` est lié à un `user.id`. Les requêtes de session récupèrent le household de l'utilisateur courant.

```bash
# Dev : applique schema en local
npm run db:push

# Prod : migrations versionnées
npm run db:migrate
```

## Local Development

Pré-requis : Node 20+, Docker.

```bash
# Postgres local
docker compose up -d

# Dépendances
npm install

# Variables d'env
cp .env.example .env.local
# Éditer .env.local : DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_*

# Schema
npm run db:push

# Dev server
npm run dev
```

## Rules

- Ne jamais committer de secrets (clés API, mots de passe, `.env*`). Voir `.gitignore`.
- Le contenu des pages est en **français** uniquement.
- Une seule session utilisateur par household. Pas de multi-tenancy complexe.
- Les dates en DB sont en UTC (timestamp), affichage en `fr-BE`.
- Le CSV Revolut importe les tickers/ISIN uniquement (pas de quantités par défaut).

Pour plus de détails sur le système de conventions Next.js utilisé, voir `AGENTS.md`.
