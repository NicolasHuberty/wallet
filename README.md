<div align="center">

# 💰 Wallet

**Suivi de patrimoine personnel — clair, honnête, sans cloud opaque.**

Web-app privée qui tient à jour votre net worth, vos DCA, vos dépenses et vos projections long terme. Une seule mise à jour mensuelle suffit.

[![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Postgres](https://img.shields.io/badge/Postgres-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![better-auth](https://img.shields.io/badge/better--auth-Google%20+%20Email-6366f1)](https://better-auth.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## Pourquoi

Les agrégateurs cloud demandent vos identifiants bancaires et vendent parfois vos données. Les tableurs sont peu engageants au quotidien. **Wallet** se place entre les deux : un formulaire mensuel, une base de données sous **votre** contrôle, et des graphiques qui racontent vraiment ce qui se passe.

## Fonctionnalités

### 🏦 Comptes multi-types
Épargne, compte courant, portefeuille-titres, pension, crypto, immobilier, crédits. Édition inline, mini-sparkline par compte, page détail avec CAGR, variation YTD, historique complet.

### 📆 Check-in mensuel unifié
Une seule page `/check-in` couvre tout : valeur des comptes, amortissement du prêt (pré-rempli depuis le tableau bancaire), dépenses récurrentes (moyenne / mois précédent / ce mois), frais one-shot avec templates réutilisables, revenus exceptionnels avec notes. Sélecteur de mois avec navigation, pas de date futur autorisé.

### 📊 Projections & historique
- Graphe combiné actifs vs passifs vs net — historique réel + projection forward par compte.
- Monte-Carlo sur la trajectoire du patrimoine.
- Mini-historique par compte basé sur les snapshots mensuels.

### 💸 DCA flexible
Chaque compte porteur de rendement peut recevoir un apport mensuel estimé et un rendement annuel. Modifiable à tout moment — ce n'est pas un engagement rigide. Le badge `+ DCA` s'édite inline depuis `/accounts` ou `/check-in`.

### 🏠 Immobilier & prêts
Import du tableau d'amortissement PDF ou CSV (parser intégré). Capital amorti et intérêts auto-pré-remplis au check-in mensuel selon la date.

### 📥 Import Revolut
Le rapport fiscal CSV est parsé — chaque ETF (ticker + ISIN + nom) est ajouté à votre wallet avec une allocation que vous ajustez ensuite en `%`.

## Stack

- **Framework** : Next.js 16 (App Router, Turbopack), React 19, TypeScript strict
- **UI** : Tailwind CSS v4, composants type shadcn/ui construits sur `@base-ui/react`
- **DB** : PostgreSQL via Drizzle ORM
- **Auth** : [better-auth](https://better-auth.com/) — Google OAuth + Email/Password
- **Charts** : Recharts
- **Déploiement** : Coolify (self-hosted)

## Quick start (dev)

```bash
# 1. Postgres local
docker compose up -d

# 2. Dépendances
npm install

# 3. Variables d'env
cp .env.example .env.local
# → remplir GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
#   générer BETTER_AUTH_SECRET : openssl rand -base64 32

# 4. Schéma
npm run db:push

# 5. Dev server
npm run dev
```

Puis `http://localhost:3000` → créer un compte ou se connecter avec Google. Un household est créé automatiquement à l'inscription.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Build de production |
| `npm run start` | Start en prod |
| `npm run db:push` | Pousser le schéma en DB (dev) |
| `npm run db:generate` | Générer une migration SQL |
| `npm run db:migrate` | Appliquer les migrations (prod) |
| `npm run db:studio` | Drizzle Studio (UI DB) |

## Architecture

```
src/
├── app/                    # App Router
│   ├── api/auth/[...all]/  # better-auth routes
│   ├── accounts/           # Liste + détail comptes
│   ├── check-in/           # Mise à jour mensuelle unifiée
│   ├── investments/        # Wallets + allocations ETF
│   ├── real-estate/        # Biens + prêts
│   ├── expenses/           # Dépenses/revenus récurrents
│   ├── charges/            # Frais one-shot
│   ├── projections/        # Projection net worth + Monte-Carlo
│   ├── login/ signup/      # Pages auth
│   └── page.tsx            # Dashboard
├── components/             # UI réutilisables
├── db/
│   ├── schema.ts           # Schéma Drizzle complet (+ tables better-auth)
│   └── index.ts            # Client pg pool
└── lib/
    ├── auth.ts             # Config better-auth
    ├── auth-client.ts      # Client React auth
    ├── queries.ts          # Queries DB (avec session resolver)
    ├── projection.ts       # Projection par compte
    ├── monte-carlo.ts      # Simulation stochastique
    ├── revolut.ts          # Parser CSV Revolut
    └── format.ts           # Formatage FR-BE
```

## Déploiement

Déploiement sur Coolify self-hosted. Voir `CLAUDE.md` (local uniquement, non versionné) pour les références infrastructures.

Le webhook GitHub est configuré : **chaque push sur `main` déclenche un build et un déploiement automatique**.

Variables d'env requises en prod :
- `DATABASE_URL` — fourni par Coolify (Postgres interne)
- `BETTER_AUTH_SECRET` — random 32 bytes
- `BETTER_AUTH_URL` — `https://wallet.huberty.pro`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud Console

Redirect OAuth Google : `https://wallet.huberty.pro/api/auth/callback/google`.

## Sécurité & données

- Les données financières ne quittent jamais votre serveur. Pas de tiers, pas de tracking, pas d'analytics.
- Les mots de passe sont hashés par better-auth (Argon2).
- Postgres Coolify a une sauvegarde programmée. **Vous** êtes responsable de vérifier sa fréquence et de tester la restauration.
- Le repo est public ; les secrets (clés API, mots de passe DB) sont en `.env.local` gitignoré.

## Licence

Projet personnel — usage privé. Pas de licence commerciale distribuée.

---

<div align="center">
  <sub>Construit avec ❤️ par <a href="https://github.com/NicolasHuberty">@NicolasHuberty</a></sub>
</div>
