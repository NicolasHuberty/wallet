# Affinage UX — « Cap »

> Compagnon de [`cashflow-spec.md`](./cashflow-spec.md). Détaille la microcopy,
> les états de chaque écran, les interactions fines et les rituels. Ton : calme,
> factuel, jamais culpabilisant. Tutoiement, fr-BE.

---

## 1. Onboarding : interactions & microcopy

### Règles transverses
- **Transition** : slide horizontal (suivant = glisse de la droite, retour =
  glisse à gauche). Sensation de progression physique.
- **Clavier** : champ montant ouvre directement le pavé numérique
  (`inputMode="decimal"`), comme le wizard actuel.
- **Skip granulaire** : chaque chapitre a un lien discret *« Je remplirai plus
  tard »*. Skipper ne bloque jamais → crée un badge *« à compléter »* sur l'écran
  *Mes flux*.
- **Auto-save** : chaque chapitre persiste un brouillon. Reprise possible en cours
  de route — ne jamais perdre l'effort (clé de l'achèvement à 15 min).

### Chapitre 0 — Promesse
```
        Cap

   15 minutes. Une fois.

   Ensuite, chaque matin, tu sauras
   exactement combien tu peux dépenser.

   Tout reste sur ton serveur. Aucun tiers,
   aucun tracker, aucune banque obligatoire.

            [ Commencer → ]
        Déjà configuré ? Passer
```

### Chapitre 1 — Toi & ton foyer (micro-séquence)
- *« Tu gères ton budget… »* → deux cartes : **Seul** / **À deux**.
- *« Des enfants à charge ? »* → stepper `– 0 +`.
- *« Une voiture ? »* → toggle + stepper. Pré-active carburant / assurance /
  entretien aux chapitres 4-5.
- Réassurance sous chaque : *« Ça nous aide à pré-remplir des montants réalistes —
  tu pourras tout ajuster. »*

### Chapitre 2 — Revenus
- *« Combien tu touches, net, chaque mois ? »* → grand champ €.
- *« Le combien du mois ? »* → mini-calendrier de jours (grille 1→31).
- *« C'est toujours ce montant ? »* → **Oui / Ça varie**. Si varie :
  *« Sur combien tu peux compter à coup sûr ? »* → champ plancher +
  *« On calculera ton budget sur ce minimum. Tout ce qui dépasse, c'est du bonus
  qui ira direct vers ton épargne. »*

### Chapitre 3 — Ton toit
- Locataire / propriétaire → loyer ou mensualité + jour de prélèvement.
- Si propriétaire → branchement module immo (devient un fixe daté).

### Chapitre 4 — Engagements fixes (grille de chips)
```
[Netflix] [Spotify] [Salle de sport] [Assurance auto] [Assurance habitation]
[Mutuelle] [Internet] [Téléphone] [Électricité] [Gaz] [Eau] [Crédit auto] [+ autre]
```
- Taper une chip l'**active** (se colore) et déplie inline : `montant` + `jour`
  (mini-calendrier) + `fréquence` (mensuel par défaut, annuel pour assurances).
- Compteur live : *« 7 engagements · 1 120 €/mois »* + mini-sparkline du mois qui
  se remplit au fur et à mesure → on voit le mois se structurer.

### Chapitre 5 — Vie variable (le slider qui vend)
Carte par poste, slider de fréquence + montant unitaire :
```
🍺 Sorties / bar
   Montant par sortie     [  40 € ]
   Combien de fois/mois   ●──────○   3×
   ────────────────────────────────────
   Budget mensuel estimé      120 €
```
Bouger le slider à 5× → « 120 € » s'anime vers « 200 € ». Lucidité immédiate sur
le coût d'une habitude. Pour les courses : cadence (hebdo / 2× sem) plutôt qu'un
nombre.

### Chapitre 6 — Objectifs
- Épargne souhaitée (montant ou « le max possible »).
- DCA / investissements auto + jour (réutilise `dcaPlan`).
- Coussin d'imprévu mensuel.

### Chapitre 7 — La révélation (chorégraphie animée)
1. Les chiffres « volent » se ranger : `Revenus 2 600`.
2. `− Fixes 1 120` se soustrait (barre qui rétrécit).
3. `− Vie 740` idem.
4. Le résultat **compte vers le haut** : `0 → 740 €`.
5. *« Voilà ce que tu peux mettre de côté chaque mois. »*
6. CTA : **[ Voir mon mois en cours → ]**.

Si **négatif** : pas de punition. *« Ton plan dépasse tes revenus de 180 €/mois.
On va t'aider à voir où ajuster. »* → CTA dashboard mettant en avant les
enveloppes les plus lourdes.

---

## 2. Pacing Dashboard : tous les états

Le héros et son message changent selon le contexte.

| Situation | Héros | Sous-titre | Couleur |
|---|---|---|---|
| Jour 1, plan frais | budget/jour | « 87 €/jour · le mois démarre » | neutre |
| En rythme | Safe-to-Spend | « 450 € libres · 32 €/jour jusqu'au 30 » | vert |
| Un peu rapide | Safe-to-Spend | « Tu vas un peu vite cette semaine » | jaune |
| Tendu | Safe-to-Spend | « Serre un peu : 11 €/jour pour finir » | orange |
| Dépassé | montant négatif | « −60 € sous le plan. On pioche dans le coussin. » | rouge |
| Salaire imminent | Safe-to-Spend | « Salaire dans 2 jours (+2 600 €) » | vert |
| Fin de mois positive | surplus | « +210 € d'avance — ira vers ton épargne 🎉 » | vert accent |

**Empty state** (onboarding incomplet) : héros = CTA doux *« Ajoute tes revenus et
tes charges fixes pour voir ton Safe-to-Spend »* + barre de complétion du profil.

**Moment « anomalie »** (le seul où l'app dérange) : si une confirmation passe au
rouge → bottom-sheet : *« Cette dépense te met à −40 € pour le mois. On l'impute au
coussin ? »* → **[ Oui, coussin ]** / **[ C'était exceptionnel ]** / **[ Annuler ]**.
Une question, trois issues, on n'y revient pas.

---

## 3. Spend Sheet (confirmation 1 clic)

```
┌──────────────────────────┐
│   Combien ?              │
│        ┌──────────┐       │
│        │   40 €   │       │   ← gros, pavé numérique focus auto
│        └──────────┘       │
│                          │
│   Sur quoi ?             │
│   [🍺 Bar] [🛒 Courses]  │   ← devinette en 1er (montant/jour/heure)
│   [⛽ Essence] [+ autre] │
│                          │
│        [ Valider ]       │
└──────────────────────────┘
```
- **Devinette** : vendredi soir 40 € → « Bar » proposé en premier (logique
  `transaction-categorizer`).
- **Tap optimiste** : la jauge descend immédiatement (optimistic UI).
- **Undo** : toast *« Dépense ajoutée · Annuler »* pendant 5 s.
- **Édition** : depuis « Le mois », tap sur un `spendEvent` passé → modifier /
  supprimer.
- **Auto-cadence** : courses hebdo déjà cochées au plan ; corriger le montant si
  la semaine a coûté plus (pas de double saisie).

---

## 4. Rituels

### Récap hebdomadaire (dimanche soir)
```
   Ta semaine
   Courses     78 € / 90 €   ✓ −12 €
   Sorties     1 × prévu 1    ✓
   ───────────────────────────
   +12 € débordent vers ton épargne 💧
```
Animation : la goutte de 12 € « tombe » dans la jauge épargne. Micro-récompense,
pas de gamification criarde.

### Clôture mensuelle (rituel fort)
```
   Mai, bouclé.

        + 210 €
   mieux que ton plan

   [graphique : plan vs réel]

   Ces 210 € + tes 740 € d'épargne
   → 950 € investis ce mois.

   [ Confirmer le versement → ]
   [ Ajuster ]
```
Puis génération du mois suivant : *« Juin est prêt. Bon mois 👋 »*. Ce moment
pousse un `netWorthSnapshot` (jonction patrimoine).

---

## 5. Navigation mobile & gestes

- **Bottom nav** 4 onglets : `Cap` · `Mois` · `Flux` · `Patrimoine`.
- **FAB central** `+ J'ai dépensé` : le geste le plus fréquent = le plus
  accessible au pouce.
- **Pull-to-refresh** sur la home = recalcul Safe-to-Spend.
- **Swipe** sur une ligne d'enveloppe → ajout rapide d'une dépense à cette
  enveloppe.

---

## 6. Ton & copy deck (fr-BE, tutoiement)

Calme, factuel, jamais culpabilisant.

| Contexte | ✅ On dit | ❌ On évite |
|---|---|---|
| Dépassement | « Serre un peu : 11 €/jour pour finir » | « Tu as trop dépensé ! » |
| Coussin entamé | « On pioche dans le coussin » | « Découvert imminent ⚠️ » |
| Surplus | « +210 € d'avance, beau mois » | « Tu n'as pas atteint ton max » |
| Anomalie | « C'était exceptionnel ? » | « Dépense suspecte détectée » |

Devise : **on aide l'utilisateur à battre son propre plan, pas à se sentir
surveillé.**

---

## 7. Décisions UX ouvertes

1. **Clôture mensuelle** : écran bloquant (1×/mois) vs notification ignorable ?
   → à trancher (impacte le caractère de l'app).
2. **Dosage gamification** (gouttes, 🎉, count-up) : jusqu'où avant de trahir
   l'esthétique clinique ? → à calibrer.
