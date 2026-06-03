# Spécification — « Cap » : moteur de cash-flow prédictif

> **Statut** : spec produit + technique, v1 (design phase, avant implémentation)
> **Pivot** : le suivi de cash-flow devient le cœur du produit ; le suivi de
> patrimoine (net worth, immobilier, projections long terme) passe en profondeur
> secondaire mais reste disponible et alimenté.
> **Philosophie** : local-first, zéro tracker tiers. C'est précisément ce qui
> justifie un onboarding exhaustif — on peut confier *toute* sa vie financière à
> l'outil parce que tout reste sur le serveur de l'utilisateur.

---

## Table des matières

1. [Vision & principe](#1-vision--principe)
2. [Le modèle mental : 3 natures de flux](#2-le-modèle-mental--3-natures-de-flux)
3. [La métrique reine : Safe-to-Spend](#3-la-métrique-reine--safe-to-spend)
4. [Le moteur de pacing](#4-le-moteur-de-pacing)
5. [Le débordement (rollover)](#5-le-débordement-rollover)
6. [L'onboarding « Concierge » — écran par écran](#6-londboarding-concierge--écran-par-écran)
7. [Le Pacing Dashboard (home)](#7-le-pacing-dashboard-home)
8. [Les autres écrans](#8-les-autres-écrans)
9. [Le cycle de vie temporel](#9-le-cycle-de-vie-temporel)
10. [Modèle de données](#10-modèle-de-données)
11. [Réutilisation de l'existant](#11-réutilisation-de-lexistant)
12. [Architecture technique & moteur de calcul](#12-architecture-technique--moteur-de-calcul)
13. [Cas limites](#13-cas-limites)
14. [Décisions ouvertes (avec recommandations)](#14-décisions-ouvertes-avec-recommandations)
15. [Plan d'implémentation par phases](#15-plan-dimplémentation-par-phases)
16. [Stratégie de test](#16-stratégie-de-test)
17. [Glossaire](#17-glossaire)

---

## 1. Vision & principe

On arrête de budgétiser dans le rétroviseur. Aujourd'hui l'app demande
« qu'as-tu dépensé ce mois-ci ? » lors d'un check-in mensuel. Demain elle dit
**« voici exactement où tu en es aujourd'hui par rapport à ton plan de vol »**.

Le mois n'est pas un seau plat de 2 000 €, c'est une **timeline d'événements
datés et probabilisés**. Comme l'app connaît la grammaire complète du mois
(salaire le 28, loyer le 1er, Spotify le 12, courses chaque samedi, ~3 sorties
bar), elle peut :

- **Auto-drainer** les budgets : le 16, l'abonnement internet du 15 est déjà
  virtuellement déduit, même si le compte bancaire n'a pas bougé.
- Afficher un **« Safe-to-Spend »** : le montant réellement libre, divisé par les
  jours restants.
- **Présumer que le plan se déroule** : l'utilisateur n'intervient que pour
  confirmer une dépense variable (un clic) ou corriger une anomalie. À l'opposé
  de YNAB qui force la réconciliation de chaque transaction.

**Résultat émotionnel visé** : la fin du stress financier par
l'hyper-prédictibilité. On sait, chaque matin, combien on peut dépenser sans
compromettre l'épargne du mois.

### Promesse mesurable
À la fin de l'onboarding, avant même d'avoir connecté un compte bancaire, l'app
calcule la **Capacité d'Épargne Réelle** au centime près. C'est le « wow effect »
qui justifie les 15 minutes d'audit.

---

## 2. Le modèle mental : 3 natures de flux

Tout ce que l'onboarding capture se range dans exactement **trois cases**. C'est
toute la modélisation produit.

| Nature | Exemple | Modélisation | Interaction utilisateur |
|---|---|---|---|
| **Fixe daté** (déterministe) | Loyer le 1er, Spotify le 12, élec le 4, crédit auto le 5 | montant + jour + récurrence | **Zéro.** Auto-déduit le jour J. |
| **Variable cadencé** (fréquentiel) | Courses ~1×/sem à 90 €, bar ~3×/mois à 40 € | enveloppe mensuelle + cadence | **1 clic** pour confirmer chaque occurrence |
| **Coussin** (résiduel) | imprévu, « au cas où » | buffer paramétrable | rien, sauf si entamé |

Les **revenus** suivent la même grammaire (fixe daté = salaire le 28 ; variable =
freelance, primes → on vit sur un *plancher*, le surplus déborde en bonus).

### Pourquoi 3 et pas plus
- Les **fixes datés** sont déterministes → ils n'ont pas besoin de saisie, juste
  d'une date. Ils *baissent* le Safe-to-Spend tout seuls au passage de leur date.
- Les **variables cadencés** sont les seuls qui demandent un geste (confirmer),
  parce que leur montant et leur timing réels dévient du plan.
- Le **coussin** absorbe l'imprévu sans casser le modèle : tant qu'il n'est pas
  épuisé, une dépense surprise ne fait pas paniquer la jauge globale.

---

## 3. La métrique reine : Safe-to-Spend

Une **seule grande valeur** en haut de la home, recalculée en continu côté
serveur (et rafraîchie à chaque chargement / confirmation).

### Formule

```
SafeToSpend(jour J) =
      soldeDisponibleActuel                 // cash réellement accessible
    + revenusRestantsCeMois(J)              // salaire/revenus datés après J
    − fixesDatésRestants(J)                 // abonnements/charges datés après J, non encore passés
    − variablesNonEncoreConsommées(J)       // reste des enveloppes variables
    − épargneEngagéeCeMois(J)               // DCA + objectif d'épargne du mois
    − coussinNonEntamé                      // buffer réservé
```

Puis :

```
budgetParJour(J) = max(0, SafeToSpend(J)) / joursRestantsCeMois(J)
```

### Détail des termes

- **`soldeDisponibleActuel`** : somme des comptes « cash/savings » marqués comme
  *compte de vie courante* (paramétrable). En mode déterministe pur, c'est une
  valeur saisie / projetée ; en mode bank-sync (GoCardless), c'est le solde réel.
- **`revenusRestantsCeMois`** : `recurringIncome` dont `dayOfMonth > J`, au
  montant *plancher* si `isVariable`.
- **`fixesDatésRestants`** : `recurringExpense` `flowType='fixed'` dont la date
  d'occurrence ce mois est `> J` et qui ne sont pas déjà marqués passés/confirmés.
- **`variablesNonEncoreConsommées`** : pour chaque enveloppe variable,
  `max(0, montantPlanifié − déjàConfirmé)`.
- **`épargneEngagéeCeMois`** : DCA (`dcaPlan` mensualisé) + `savingsTarget` du
  cycle.
- **`coussinNonEntamé`** : `bufferAmount` du profil − dépenses imputées au coussin.

### Variante « solde de fin de mois projeté »
Pour la timeline et la prévision, on calcule aussi :

```
soldeFinDeMoisProjeté =
      soldeDisponibleActuel
    + Σ revenusRestants
    − Σ fixesDatésRestants
    − Σ variablesAttendues (au plan, pas au consommé)
```

C'est cette valeur qui pilote la couleur « vert / orange / rouge » globale.

---

## 4. Le moteur de pacing

**Insight central : la couleur d'une jauge n'est pas fonction de son
remplissage absolu, mais de son *avance sur le calendrier*.**

Pour chaque enveloppe variable :

```
ratioTemps      = jourCourant / joursDansLeMois          // ex. 10/30 = 0.33
ratioConsommé   = montantConsommé / montantPlanifié      // ex. 0.60
vélocité        = ratioConsommé / ratioTemps             // ex. 1.8
```

| Vélocité | État | Couleur | Lecture |
|---|---|---|---|
| `≤ 1.0` | dans le rythme | vert | tu tiens le budget |
| `1.0 – 1.3` | un peu rapide | jaune | attention au tempo |
| `> 1.3` | en avance | orange | tu brûles trop vite |
| `≥ 1.0` **et** consommé `≥ 100 %` | dépassé | rouge | enveloppe vide avant la fin |

Pour les enveloppes à **cadence hebdomadaire** (courses), le « plan » se reparti
par semaine : le pacing se calcule sur la semaine en cours, pas sur le mois, pour
éviter le faux positif du « tout dépensé en début de mois ».

Pour les enveloppes à **cadence par occurrence** (3 sorties bar/mois), on suit le
**nombre d'occurrences** consommées (`2 sorties / 3`) en plus du montant.

La jauge globale du mois reprend la même logique sur l'agrégat
`variables + coussin`.

---

## 5. Le débordement (rollover)

La mécanique qui rend l'app *motivante* plutôt que punitive : **l'argent non
dépensé migre visuellement vers l'épargne / l'investissement.**

- En fin de **semaine**, si l'enveloppe hebdo (courses) finit sous le plan, le
  surplus « déborde ». Animation : la barre se vide vers le haut, la jauge
  d'épargne grossit d'autant.
- En fin de **mois**, le solde non dépensé global est proposé en **versement
  d'épargne / DCA** (cf. décision ouverte §14.2).
- Le but n'est pas de battre l'app, c'est de **battre son propre modèle
  prévisionnel**. Chaque euro économisé devient visiblement du patrimoine futur.

Politique de rollover paramétrable par enveloppe (`rolloverPolicy`) :

| Politique | Comportement |
|---|---|
| `to_savings` | le surplus part vers l'épargne/DCA (défaut pour la plupart) |
| `accumulate` | le surplus reste dans l'enveloppe le mois suivant (ex. budget « cadeaux » qu'on lisse) |
| `reset` | l'enveloppe repart de zéro chaque mois, surplus perdu (anti-thésaurisation) |

---

## 6. L'onboarding « Concierge » — écran par écran

### Principes UX
- **Une question = un écran plein.** Typo large, beaucoup de blanc, transitions
  fluides. Jamais de formulaire long à scroller.
- **Barre de progression discrète** en haut (« Chapitre 3 / 7 »).
- **Toujours « passer »** possible (sinon abandon à 15 min). Les chapitres non
  remplis se complètent plus tard depuis l'écran *Mes flux*.
- **Grilles de chips pré-remplies** plutôt que des champs vides : on tape pour
  activer, puis on précise montant + jour.
- **Feedback live** : chaque saisie met à jour un total visible (premier choc de
  lucidité progressif).

> **Note d'implémentation** : on étend le wizard existant
> (`src/app/onboarding/wizard.tsx`), aujourd'hui en 3–4 étapes (Comptes →
> Revenus → Récap → Biens immo). On insère les nouveaux chapitres et on enrichit
> `completeOnboarding` (`src/app/onboarding/actions.ts`).

### Chapitre 0 — La promesse (1 écran, sans question)
> *« 15 minutes maintenant. Ensuite, tu sauras chaque jour combien tu peux
> dépenser. Et tout reste sur ton serveur — aucun tiers. On commence ? »*

C'est le contrat moral qui justifie l'effort.

### Chapitre 1 — Toi & ton foyer
- Seul / en couple ? → segmente revenus & charges (1 ou 2 colonnes ; réutilise
  `member` + `ownership`).
- Nombre d'enfants à charge → débloque plus tard une enveloppe « enfants ».
- As-tu une (des) voiture(s) ? → pré-active les postes carburant / assurance auto
  / entretien.
- Ville (optionnel) → ordres de grandeur réalistes pour les suggestions.

**Capturé** → `financialProfile` (composition, enfants, voitures, ville).

### Chapitre 2 — Tes revenus
- Montant net mensuel + **jour de versement** (ex. 28).
- Fixe ou variable ? Si variable → demander un **plancher** (montant garanti). Le
  Safe-to-Spend tourne sur le plancher ; le surplus déborde en bonus.
- Revenus secondaires (allocations, loyer perçu, freelance) → datables ou
  « surprise ».

**Capturé** → `recurringIncome` (+ nouveaux champs `dayOfMonth`, `isVariable`,
`floorAmount`).

### Chapitre 3 — Ton toit
- Locataire / propriétaire.
- Loyer **ou** mensualité de crédit + jour de prélèvement.
- Si propriétaire → branchement sur le module immo existant (`property`,
  `mortgage`, `amortizationEntry`). La mensualité de prêt devient un fixe daté.

**Capturé** → `recurringExpense` (`category='housing'`, `flowType='fixed'`,
`dayOfMonth`) + éventuellement `property`/`mortgage`.

### Chapitre 4 — Tes engagements fixes datés
La « machine à abonnements ». **Grille de chips** :

```
[Netflix] [Spotify] [Salle de sport] [Assurance auto] [Assurance habitation]
[Mutuelle] [Internet] [Téléphone] [Électricité] [Gaz] [Eau] [Crédit auto] [+ autre]
```

Pour chaque chip activée : **montant + jour du mois** (+ fréquence si ≠ mensuel :
annuel pour certaines assurances). Total fixe calculé en direct en bas d'écran.

**Capturé** → `recurringExpense` (`flowType='fixed'`, `dayOfMonth`, `frequency`).

### Chapitre 5 — Ta vie variable (le cœur)
On capture le **rythme**, pas les montants exacts. Pour chaque poste, un slider de
fréquence qui **recalcule l'enveloppe mensuelle en live** :

- **Courses** : ~montant par passage + fréquence (hebdo / 2× sem).
- **Plaisirs / bar / sorties** : *« ~3 fois/mois, ~40 € »* → enveloppe + cadence.
- **Carburant / transport**, **restau**, **shopping**, **enfants**…

Micro-interaction qui vend la feature : bouger le slider de 3 → 5 sorties/mois
affiche *« +80 € »* instantanément.

**Capturé** → `budgetEnvelope` (label, `monthlyAmount`, `cadence`,
`occurrencesPerMonth`, `rolloverPolicy`).

### Chapitre 6 — Tes objectifs
- Capacité d'épargne souhaitée (montant, ou « le max possible »).
- DCA / investissements auto + jour → réutilise `dcaPlan`.
- Taille du **coussin** d'imprévu mensuel.

**Capturé** → `financialProfile.savingsTarget`, `financialProfile.bufferAmount`,
`dcaPlan`.

### Chapitre 7 — La révélation 🎯 (payoff, sans question)

```
            Ta capacité d'épargne réelle

                    740 € / mois

   Revenus 2 600  −  Fixes 1 120  −  Vie 740
   ───────────────────────────────────────
   Reste à investir / mettre de côté : 740 €
```

CTA unique : **« Voir mon mois en cours → »** qui dépose directement sur le
Pacing Dashboard, **déjà peuplé**. Zéro écran vide après l'onboarding.

---

## 7. Le Pacing Dashboard (home)

Hiérarchie verticale stricte, du « combien là, tout de suite » vers le détail.
Une info dominante par zone. Esthétique clinique conservée.

```
┌─────────────────────────────────────────────┐
│  Lundi 3 juin · jour 3/30                     │
│                                               │
│        SAFE TO SPEND AUJOURD'HUI              │
│                                               │
│                 32 €                          │  ← héros, énorme
│         450 € libres jusqu'au 30              │
│                                               │
│  ●────────────────○  tu es dans le vert       │  ← jauge globale du mois
├─────────────────────────────────────────────┤
│  Enveloppes variables                         │
│  Courses    ▓▓▓▓▓▓▓░░░  72 / 360 €   ✓ ok     │
│  Bar/sorties▓▓▓▓▓▓▓▓▓░  2 sorties / 3  orange │  ← pacing trop rapide
│  Carburant  ▓▓░░░░░░░░  30 / 140 €            │
├─────────────────────────────────────────────┤
│  À venir cette semaine                        │
│  04 · Électricité      −85 €  (auto)          │
│  12 · Spotify          −11 €  (auto)          │
│  15 · Salaire ?        +2 600 €               │
├─────────────────────────────────────────────┤
│  [ + J'ai dépensé ]   ← bouton de confirmation│
└─────────────────────────────────────────────┘
```

### Les 3 questions auxquelles la home répond instantanément
1. **« Je peux dépenser combien aujourd'hui ? »** → le héros (Safe-to-Spend +
   budget/jour).
2. **« Sur quoi je dérape ? »** → jauges de vélocité, couleur par *pacing*.
3. **« Qu'est-ce qui m'attend ? »** → timeline des événements datés à venir.

### Composants
- **HeroSafeToSpend** : grand chiffre, sous-titre « X € libres jusqu'au DD »,
  jauge globale, couleur vert/orange/rouge.
- **EnvelopeList** : une ligne par `budgetEnvelope`, barre + état + (pour les
  cadencées) compteur d'occurrences.
- **UpcomingTimeline** : prochains événements datés (revenus + fixes), 7 à 14
  jours glissants.
- **QuickSpendButton** : ouvre la *Spend Sheet* (cf. §8).

---

## 8. Les autres écrans

### Carte de navigation post-pivot
```
🏠 Cap (home)   ← Pacing Dashboard
📅 Le mois       ← timeline complète (passé/à venir), clôture de cycle
💸 Mes flux      ← édition fixes datés + enveloppes variables + revenus
🎯 Objectifs     ← épargne cible, DCA, coussin
📈 Patrimoine    ← (secondaire) net worth, immo, projections long terme
⚙️ Profil        ← relance/édition de l'onboarding
```

### Spend Sheet (confirmation 1 clic)
Feuille minimale ouverte par « J'ai dépensé » :
- **Montant** (gros pavé numérique).
- **Enveloppe devinée** : heuristique (montant + jour + heure → suggère « Bar » un
  vendredi soir ; voir réutilisation de `transaction-categorizer`).
- Validation = 1 tap. Crée un `spendEvent`.

### « Le mois » (timeline + clôture)
- Vue calendrier/liste de tous les événements datés du cycle (passés grisés, à
  venir actifs).
- Bouton **Clôturer le mois** (ou auto à la fin) → calcule le bilan vs plan,
  applique le rollover, alimente `netWorthSnapshot`, génère le cycle suivant.

### « Mes flux »
CRUD sur `recurringExpense` (fixes), `budgetEnvelope` (variables),
`recurringIncome`. Réutilise largement les pages `expenses/` existantes.

---

## 9. Le cycle de vie temporel

- **Chaque jour** : ouvrir, lire le chiffre, éventuellement confirmer une
  dépense. ~10 s.
- **Chaque semaine** : récap *« semaine finie à +18 € → versés vers l'épargne »*,
  reset des enveloppes hebdo, débordement.
- **Chaque mois** : clôture → *« mois bouclé à +210 € vs plan »*, surplus → DCA,
  nouveau cycle généré depuis le profil, **alimentation de `netWorthSnapshot`**
  (jonction propre avec la partie patrimoine).

### Génération d'un cycle
À la création d'un `monthCycle` (le 1er du mois, ou à la 1re ouverture du mois) :
1. Matérialiser les **occurrences datées** du mois (revenus + fixes) → table
   `cycleEvent` ou calcul à la volée (cf. §12).
2. Calculer `plannedIncome`, `plannedFixed`, `plannedVariable`, `savingsTarget`.
3. Reporter les rollovers `accumulate` du cycle précédent.
4. Figer le `baseline` (snapshot du plan) pour pouvoir comparer plan vs réel en
   fin de mois.

---

## 10. Modèle de données

On **étend** des tables existantes et on **ajoute** un petit nombre de tables
dédiées. Style : `nanoid(12)` pour les IDs, `timestamps` partagés, index sur les
FKs (cohérent avec `src/db/schema.ts`).

### 10.1 Extensions de tables existantes

**`recurringExpense`** — ajouter :
```ts
dayOfMonth: integer("day_of_month"),          // 1..28/31, jour d'occurrence (fixes datés)
frequency: text("frequency", { enum: flowFrequency }).notNull().default("monthly"),
flowType: text("flow_type", { enum: flowType }).notNull().default("fixed"), // 'fixed' | 'variable'
active: boolean("active").notNull().default(true),     // pause sans suppression
autoConfirm: boolean("auto_confirm").notNull().default(true), // fixes datés: déduits sans clic
```
`flowFrequency = ["weekly","biweekly","monthly","quarterly","yearly"]`
`flowType = ["fixed","variable"]`

**`recurringIncome`** — ajouter :
```ts
dayOfMonth: integer("day_of_month"),          // jour de versement
isVariable: boolean("is_variable").notNull().default(false),
floorAmount: real("floor_amount"),            // montant garanti si variable (sinon = amount)
```

### 10.2 Nouvelles tables

**`financialProfile`** (1 par household) — sortie de l'onboarding + réglages
globaux :
```ts
export const financialProfile = pgTable("financial_profile", {
  id: id(),
  householdId: text("household_id").notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  composition: text("composition", { enum: ["single", "couple"] }).notNull().default("single"),
  childrenCount: integer("children_count").notNull().default(0),
  carsCount: integer("cars_count").notNull().default(0),
  city: text("city"),
  // Objectifs
  savingsTargetMode: text("savings_target_mode", { enum: ["fixed", "max"] }).notNull().default("max"),
  savingsTargetAmount: real("savings_target_amount"),    // si mode 'fixed'
  bufferAmount: real("buffer_amount").notNull().default(0), // coussin mensuel
  // Quel(s) compte(s) constitue(nt) le "solde de vie courante"
  spendingAccountId: text("spending_account_id").references(() => account.id, { onDelete: "set null" }),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("financial_profile_household_id_idx").on(t.householdId)]);
```

**`budgetEnvelope`** — les variables cadencés :
```ts
export const envelopeCadence = ["weekly", "biweekly", "monthly", "per_occurrence"] as const;
export const rolloverPolicy = ["to_savings", "accumulate", "reset"] as const;

export const budgetEnvelope = pgTable("budget_envelope", {
  id: id(),
  householdId: text("household_id").notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  category: text("category").notNull(),       // réutilise expenseCategory ou free-text
  monthlyAmount: real("monthly_amount").notNull(),  // enveloppe mensuelle calculée
  cadence: text("cadence", { enum: envelopeCadence }).notNull().default("monthly"),
  occurrencesPerMonth: real("occurrences_per_month"), // ex. 3 sorties bar ; ~4.33 si hebdo
  rolloverPolicy: text("rollover_policy", { enum: rolloverPolicy }).notNull().default("to_savings"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [index("budget_envelope_household_id_idx").on(t.householdId)]);
```

**`monthCycle`** — l'état figé d'un mois (anchor du pacing & de la clôture) :
```ts
export const cycleStatus = ["open", "closed"] as const;

export const monthCycle = pgTable("month_cycle", {
  id: id(),
  householdId: text("household_id").notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  month: text("month").notNull(),             // "YYYY-MM"
  status: text("status", { enum: cycleStatus }).notNull().default("open"),
  // Plan figé à l'ouverture (pour comparer plan vs réel)
  plannedIncome: real("planned_income").notNull().default(0),
  plannedFixed: real("planned_fixed").notNull().default(0),
  plannedVariable: real("planned_variable").notNull().default(0),
  savingsTarget: real("savings_target").notNull().default(0),
  bufferAmount: real("buffer_amount").notNull().default(0),
  openingBalance: real("opening_balance").notNull().default(0), // solde dispo au début
  // Résultat figé à la clôture
  closedAt: timestamp("closed_at", { withTimezone: true }),
  actualSaved: real("actual_saved"),          // ce qui a réellement été mis de côté
  varianceVsPlan: real("variance_vs_plan"),   // +210 € = mieux que prévu
  ...timestamps,
}, (t) => [index("month_cycle_household_id_month_idx").on(t.householdId, t.month)]);
```

**`spendEvent`** — les confirmations de dépenses variables / imprévus (1 clic) :
```ts
export const spendSource = ["manual", "auto_cadence", "bank_sync", "rollover"] as const;

export const spendEvent = pgTable("spend_event", {
  id: id(),
  householdId: text("household_id").notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  cycleId: text("cycle_id").references(() => monthCycle.id, { onDelete: "set null" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  amount: real("amount").notNull(),           // positif = dépense
  envelopeId: text("envelope_id").references(() => budgetEnvelope.id, { onDelete: "set null" }),
  // OU imputé directement au coussin si pas d'enveloppe
  chargedToBuffer: boolean("charged_to_buffer").notNull().default(false),
  label: text("label"),
  source: text("source", { enum: spendSource }).notNull().default("manual"),
  // Lien optionnel vers un cashflow bancaire réel (mode bank-sync)
  linkedCashflowId: text("linked_cashflow_id"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [
  index("spend_event_household_cycle_idx").on(t.householdId, t.cycleId),
  index("spend_event_envelope_idx").on(t.envelopeId),
  index("spend_event_date_idx").on(t.date),
]);
```

### 10.3 Ce qu'on NE crée pas (réutilisation directe)
- **Occurrences datées des fixes/revenus** : calculées à la volée depuis
  `recurringExpense.dayOfMonth` + `frequency` (pas de table d'occurrences ; voir
  §12). On matérialise seulement si un besoin de perf apparaît.
- **DCA / épargne engagée** : `dcaPlan` existant.
- **Snapshots patrimoine** : `netWorthSnapshot` / `accountSnapshot` existants.
- **Solde réel** : `account.currentValue` ou bank-sync GoCardless existant.

### 10.4 Relations Drizzle à ajouter
`financialProfile`, `budgetEnvelope`, `monthCycle`, `spendEvent` → `household`
(et `spendEvent` → `budgetEnvelope`, `monthCycle`). Ajouter aux
`householdRelations` les `many(budgetEnvelope)`, `many(monthCycle)`,
`many(spendEvent)`, `one(financialProfile)`.

### 10.5 Migration
Nouvelle migration Drizzle `0008_*.sql` (suite de `0007_next_the_call.sql`).
`npm run db:generate` puis `db:push` (dev) / `db:migrate` (prod). Aucune donnée
existante détruite : on ajoute des colonnes nullable + tables neuves.

---

## 11. Réutilisation de l'existant

Le pivot s'appuie sur ~70 % de briques déjà présentes.

| Besoin nouveau | Brique existante réutilisée |
|---|---|
| Capturer fixes/variables/revenus | `recurringExpense`, `recurringIncome` (+ colonnes) |
| Catégories de dépense | `expenseCategory` enum |
| Deviner l'enveloppe d'une dépense | `src/lib/transaction-categorizer.ts`, `categorization.ts`, `category_rule`, `bce_company` |
| Solde réel automatique (mode bancaire) | `src/lib/gocardless.ts`, `bankConnection`, `accountCashflow` |
| Prévision probabiliste fin de mois | `src/lib/monte-carlo.ts` (horizon recalibré jours au lieu d'années) |
| Détection « tu dépenses anormalement » | `src/lib/anomaly.ts` (déviation vs moyenne glissante) |
| Pré-remplissage intelligent | pattern de `src/lib/checkin-prefill.ts` |
| Épargne / investissement engagé | `dcaPlan` |
| Jonction patrimoine | `netWorthSnapshot`, `accountSnapshot`, module immo |
| Projection long terme (secondaire) | `projection.ts`, `projection-v2.ts`, `projectionScenario` |
| Wizard onboarding | `src/app/onboarding/wizard.tsx` + `actions.ts` |
| Formatage € / dates fr-BE | `src/lib/format.ts` |

### Monte-Carlo recalibré
`monte-carlo.ts` modélise aujourd'hui le patrimoine à 30 ans avec des sigmas par
bucket. Pour le cash-flow, on le pointe sur l'**horizon du mois** : les
enveloppes variables cadencées (les « 3 sorties bar aléatoires ») deviennent des
tirages, et on affiche une **fourchette de solde de fin de mois**
(*« tu finiras entre +120 € et −40 € selon tes sorties »*). Réutilisation du
moteur, changement d'horizon et de variables d'entrée.

---

## 12. Architecture technique & moteur de calcul

### 12.1 Couche pure (lib, testable, sans DB)
Nouveau `src/lib/cashflow/` :

- **`occurrences.ts`** — `expandOccurrences(flow, month): DatedOccurrence[]`.
  Déplie un `recurringExpense`/`recurringIncome` en dates concrètes du mois
  selon `frequency` + `dayOfMonth` (gère les mois à 28/30/31 jours, jour 31 →
  dernier jour du mois). Pur, testé.
- **`safe-to-spend.ts`** — `computeSafeToSpend(input): SafeToSpendResult`.
  Implémente la formule §3. Entrées : solde, occurrences à venir, enveloppes +
  consommé, épargne engagée, coussin, date courante. Sortie : `safeToSpend`,
  `budgetPerDay`, `projectedEndBalance`, `globalState`.
- **`pacing.ts`** — `computePacing(envelope, consumed, day, daysInMonth)`.
  Implémente §4 (vélocité, couleur, compteur d'occurrences). Pur, testé.
- **`rollover.ts`** — `applyRollover(cycle, envelopes, events)` → versements
  d'épargne + report. Implémente §5.
- **`cycle.ts`** — `buildCyclePlan(profile, flows, envelopes, month)` → le plan
  figé à l'ouverture (§9).
- **`month-forecast.ts`** — wrapper Monte-Carlo recalibré (§11).

Tous suffixés `.test.ts` (vitest, cohérent avec le repo).

### 12.2 Couche données (server)
- Étendre `src/lib/queries.ts` : `getOpenCycle(householdId)`,
  `getEnvelopesWithConsumption(cycleId)`, `getUpcomingDatedFlows(householdId,
  fromDay)`, `getFinancialProfile(householdId)`.
- Server Actions : `confirmSpend()`, `editFlow()`, `closeCycle()`,
  `openCycle()`, `updateProfile()`.

### 12.3 Couche UI (App Router)
- `src/app/page.tsx` (ou `dashboard/`) → devient le **Pacing Dashboard**.
- `src/app/cycle/` (ou `month/`) → timeline + clôture.
- `src/app/flows/` (ou enrichir `expenses/`) → CRUD flux + enveloppes.
- `src/app/goals/` → objectifs.
- Patrimoine actuel (`snapshots/`, `real-estate/`, `projections/`) → conservé,
  rétrogradé dans la nav.

### 12.4 Quand calcule-t-on ?
- **À la volée** au chargement de la home (server component) : `getOpenCycle` +
  `computeSafeToSpend`. Pas de cron nécessaire au départ.
- **Auto-ouverture du cycle** : si aucun `monthCycle` pour le mois courant à la
  1re requête du mois → on l'ouvre (lazy). Évite un cron.
- **Clôture** : manuelle (bouton) ou lazy à l'ouverture du mois suivant (on
  clôt l'ancien). Un cron Coolify est optionnel (récap hebdo / notifs), pas
  requis pour le MVP.

---

## 13. Cas limites

- **Revenu variable** : on vit sur le `floorAmount`. Le surplus, à sa réception,
  déborde en bonus → épargne. Pas de fausse promesse de Safe-to-Spend.
- **Démarrage en milieu de mois** : 1er cycle *partiel et prorata*, clairement
  signalé (« mois incomplet, on calibre »). Réutilise la logique mid-month de
  `checkin-prefill.ts`.
- **Fixe daté qui saute un mois** (résiliation, vacances) : `active=false` (pause)
  sans supprimer. Une occurrence ponctuelle peut être annulée pour un mois donné
  (skip stocké sur le cycle).
- **Jour 29/30/31 dans un mois court** : `dayOfMonth` clampé au dernier jour du
  mois dans `expandOccurrences`.
- **Dépense imprévue qui crève le coussin** : impute d'abord au coussin, puis au
  Safe-to-Spend global ; l'app pose **une** question si ça passe au rouge.
- **Enveloppe cadencée sous/sur-consommée** : la vélocité gère le sur ; le
  rollover gère le sous.
- **Double comptage en mode bank-sync** : un `spendEvent` lié à un
  `accountCashflow` (`linkedCashflowId`) ne doit pas être recompté. La
  réconciliation suit la même idée d'idempotence que `cashflowSource` /
  `externalId`.
- **Multi-membres (couple)** : `ownership` + `member` existants ; le cash-flow
  s'agrège au household, avec filtre par membre en option.
- **Changement de plan en cours de mois** : éditer un flux recalcule le
  Safe-to-Spend mais ne réécrit pas le `baseline` figé du cycle (sinon on perd la
  comparaison plan vs réel). On garde la trace.

---

## 14. Décisions ouvertes (avec recommandations)

### 14.1 Grain de la confirmation des variables
**Question** : jusqu'où auto-déduire les variables sans clic ?

| Option | Friction | Précision |
|---|---|---|
| A. Tout manuel (chaque dépense confirmée) | haute | maximale |
| B. **Hybride (recommandé)** : hebdo (courses) auto-déduit au plan, corrigeable ; occasionnel (bar) confirmé au clic | basse | bonne |
| C. Tout auto (plan présumé), correction seulement si anomalie | minimale | approximative |

> **Recommandation : B.** C'est l'équilibre qui colle au mental model « présume
> le plan, confirme l'exceptionnel ». Les courses récurrentes se déduisent toutes
> seules à leur cadence ; les sorties (par nature aléatoires) se tapent en 1 clic.

### 14.2 Destination du débordement
**Question** : où va l'argent économisé en fin de semaine/mois ?

| Option | Effet |
|---|---|
| A. Épargne libre (compte savings) | simple, liquide |
| B. DCA / investissement | aligné « patrimoine », plus engageant |
| C. **L'utilisateur choisit (recommandé)** : défaut = épargne, override = DCA, par `rolloverPolicy` | flexible |

> **Recommandation : C** avec défaut `to_savings`. Le `rolloverPolicy` par
> enveloppe (§5) le permet déjà ; on ajoute juste un réglage global par défaut
> dans `financialProfile`.

### 14.3 Mode déterministe pur vs bank-sync (au MVP)
> **Recommandation** : MVP en **déterministe pur** (solde saisi / projeté,
> confirmations manuelles). Le bank-sync GoCardless existant devient une *couche
> d'enrichissement* en phase 7 (réconciliation automatique des `spendEvent`), pas
> un prérequis. Cohérent avec le local-first et réduit la surface du MVP.

---

## 15. Plan d'implémentation par phases

> Chaque phase est livrable et testable indépendamment. Pas de big-bang.

**Phase 0 — Modèle de données**
- Étendre `recurringExpense` / `recurringIncome`.
- Créer `financialProfile`, `budgetEnvelope`, `monthCycle`, `spendEvent`.
- Migration `0008_*`, relations, types.

**Phase 1 — Couche pure (lib + tests)**
- `cashflow/occurrences.ts`, `safe-to-spend.ts`, `pacing.ts`, `cycle.ts`,
  `rollover.ts` + `.test.ts`. Aucune UI : on valide la math d'abord.

**Phase 2 — Génération & lecture du cycle**
- Queries + auto-ouverture lazy du `monthCycle`.
- Server actions `openCycle`, `confirmSpend`.

**Phase 3 — Pacing Dashboard (read-only)**
- Hero Safe-to-Spend + EnvelopeList + UpcomingTimeline, données réelles, sans
  encore le bouton de confirmation.

**Phase 4 — Confirmation 1 clic**
- Spend Sheet + `spendEvent`, devinette d'enveloppe via
  `transaction-categorizer`.

**Phase 5 — Pacing couleurs + débordement**
- Vélocité/couleurs, animation de rollover hebdo, jauge d'épargne qui grossit.

**Phase 6 — Onboarding Concierge**
- Insérer chapitres 1→6 dans le wizard, écran de révélation (capacité
  d'épargne). Enrichir `completeOnboarding`.

**Phase 7 — Clôture, snapshot & prévision**
- Clôture de cycle + `netWorthSnapshot`, récap hebdo/mensuel, Monte-Carlo
  recalibré (fourchette fin de mois), bank-sync en enrichissement, notifications.

**Phase 8 — Rétrogradation patrimoine**
- Réorganiser la nav, déplacer net worth / immo / projections en section
  secondaire.

---

## 16. Stratégie de test

- **Unitaire (vitest)** sur toute la couche `cashflow/*` — c'est là qu'est le
  risque (math du Safe-to-Spend, pacing, occurrences sur mois courts, rollover).
  Le repo a déjà la convention `*.test.ts`.
- **Cas de bord obligatoires** : mois à 28/31 j, `dayOfMonth=31`, démarrage
  mid-month, revenu variable, coussin crevé, double comptage bank-sync.
- **Snapshot du baseline** : vérifier qu'éditer un flux ne réécrit pas le plan
  figé du cycle.
- **Intégration** : génération d'un cycle complet → Safe-to-Spend cohérent →
  confirmations → clôture → snapshot.

---

## 17. Glossaire

- **Safe-to-Spend** : montant réellement libre à un instant T, après déduction
  virtuelle de tous les engagements datés restants, des enveloppes non
  consommées, de l'épargne engagée et du coussin.
- **Fixe daté** : flux déterministe (montant + jour) auto-déduit, sans clic.
- **Variable cadencé** : poste de dépense modélisé par une enveloppe mensuelle +
  une cadence/occurrences, confirmé au geste.
- **Coussin (buffer)** : réserve mensuelle pour l'imprévu.
- **Cycle (`monthCycle`)** : l'état figé d'un mois — plan à l'ouverture, résultat
  à la clôture.
- **Pacing / vélocité** : rapport entre rythme de consommation et rythme du
  calendrier ; pilote la couleur des jauges.
- **Débordement (rollover)** : migration de l'argent non dépensé vers l'épargne /
  l'investissement.
- **Capacité d'Épargne Réelle** : `revenus − fixes − variables − coussin`,
  affichée à la fin de l'onboarding.
</invoke>
