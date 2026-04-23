/**
 * Idempotent demo seed — fully fictional household (no real bank / brand / address).
 *
 * Shows the full potential of Wallet with 24 months of history, 9 accounts,
 * a brokerage with 8 ETFs, a 25-year mortgage, and a realistic expense mix.
 *
 *   DATABASE_URL=... npx tsx scripts/seed-demo.ts
 */
import "dotenv/config";
import { db, schema } from "@/db";
import { nanoid } from "nanoid";

// ---------- helpers ----------
function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthsAgo(n: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0, 0);
}
function jitter(base: number, pct = 0.1) {
  return Math.round(base * (1 + (Math.random() - 0.5) * 2 * pct));
}
function daysAgoDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function wipe() {
  console.log("→ wiping tables…");
  const tables = [
    schema.amortizationEntry,
    schema.mortgage,
    schema.property,
    schema.recurringExpenseActual,
    schema.chargeTemplate,
    schema.incomeTemplate,
    schema.oneOffCharge,
    schema.oneOffIncome,
    schema.recurringExpense,
    schema.recurringIncome,
    schema.projectionScenario,
    schema.netWorthSnapshot,
    schema.accountSnapshot,
    schema.holding,
    schema.dcaPlan,
    schema.account,
    schema.member,
    schema.household,
    schema.verification,
    schema.session,
    schema.authAccount,
    schema.user,
  ];
  for (const t of tables) await db.delete(t);
}

// ---------- seed ----------
async function main() {
  await wipe();

  console.log("→ demo user + household…");
  const userId = "demo-user-" + nanoid(6);
  await db.insert(schema.user).values({
    id: userId,
    email: "demo@wallet.huberty.pro",
    emailVerified: true,
    name: "Démo Ménage",
  });
  const [hh] = await db
    .insert(schema.household)
    .values({ userId, name: "Démo Ménage", baseCurrency: "EUR" })
    .returning();
  const householdId = hh.id;

  console.log("→ members…");
  const [m1] = await db
    .insert(schema.member)
    .values({ householdId, name: "Alex", email: "alex@demo.local", color: "#C75C2C" })
    .returning();
  const [m2] = await db
    .insert(schema.member)
    .values({ householdId, name: "Sam", email: "sam@demo.local", color: "#2B4A3B" })
    .returning();

  console.log("→ accounts…");
  const [cash] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Compte courant ménage",
      kind: "cash",
      institution: "Fictiv Bank",
      currentValue: 3_840,
      ownership: "shared",
      sharedSplitPct: 50,
      annualYieldPct: 0,
    })
    .returning();

  const [savings] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Épargne principale",
      kind: "savings",
      institution: "PrimeSave",
      currentValue: 24_520,
      ownership: "shared",
      sharedSplitPct: 50,
      annualYieldPct: 2.75,
      monthlyContribution: 650,
    })
    .returning();

  const [emergency] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Réserve de précaution",
      kind: "savings",
      institution: "PrimeSave",
      currentValue: 9_500,
      ownership: "shared",
      sharedSplitPct: 50,
      annualYieldPct: 2.5,
      monthlyContribution: 100,
    })
    .returning();

  const [brokerage] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Portefeuille long terme",
      kind: "brokerage",
      institution: "Nomad Invest",
      currentValue: 18_740,
      ownership: "member",
      ownerMemberId: m1.id,
      annualYieldPct: 7,
      monthlyContribution: 400,
    })
    .returning();

  const [retirement] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Épargne-pension",
      kind: "retirement",
      institution: "Vista Retirement",
      currentValue: 11_320,
      ownership: "member",
      ownerMemberId: m2.id,
      annualYieldPct: 5,
      monthlyContribution: 82,
    })
    .returning();

  const [crypto] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Wallet crypto",
      kind: "crypto",
      institution: "CoinHarbor",
      currentValue: 3_650,
      ownership: "member",
      ownerMemberId: m1.id,
      annualYieldPct: 12,
      monthlyContribution: 75,
    })
    .returning();

  const [realEstate] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Maison familiale",
      kind: "real_estate",
      institution: "—",
      currentValue: 432_000,
      ownership: "shared",
      sharedSplitPct: 50,
    })
    .returning();

  const [loan] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Prêt hypothécaire",
      kind: "loan",
      institution: "NorthBridge Mortgages",
      currentValue: -248_000,
      ownership: "shared",
      sharedSplitPct: 50,
    })
    .returning();

  const [creditCard] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Carte de crédit",
      kind: "credit_card",
      institution: "Fictiv Bank",
      currentValue: -1_180,
      ownership: "shared",
      sharedSplitPct: 50,
    })
    .returning();

  const allAccounts = [
    cash,
    savings,
    emergency,
    brokerage,
    retirement,
    crypto,
    realEstate,
    loan,
    creditCard,
  ];

  console.log("→ property + mortgage + amortization…");
  const purchaseDate = new Date(2023, 5, 15);
  const [property] = await db
    .insert(schema.property)
    .values({
      accountId: realEstate.id,
      address: "Rue des Tilleuls 14 · 4000 Parcville",
      purchasePrice: 410_000,
      purchaseDate,
      currentValue: 432_000,
      annualAppreciationPct: 2.0,
      monthlyFees: 48,
      surfaceSqm: 172,
    })
    .returning();

  const mortgageStart = new Date(2023, 6, 1);
  const termMonths = 300; // 25 years
  const rate = 0.028 / 12;
  const monthlyPayment = 1_410;
  const principal0 = 260_000;

  const [mortgage] = await db
    .insert(schema.mortgage)
    .values({
      accountId: loan.id,
      propertyId: property.id,
      lender: "NorthBridge Mortgages",
      principal: principal0,
      interestRatePct: 2.8,
      termMonths,
      startDate: mortgageStart,
      monthlyPayment,
      remainingBalance: 248_000,
    })
    .returning();

  let balance = principal0;
  for (let i = 0; i < termMonths; i++) {
    const interest = balance * rate;
    const principalPaid = Math.max(0, monthlyPayment - interest);
    balance = Math.max(0, balance - principalPaid);
    const due = new Date(mortgageStart);
    due.setMonth(due.getMonth() + i);
    await db.insert(schema.amortizationEntry).values({
      mortgageId: mortgage.id,
      dueDate: due,
      payment: monthlyPayment,
      principal: Number(principalPaid.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      balance: Number(balance.toFixed(2)),
    });
  }

  console.log("→ recurring incomes…");
  const incomes: Array<{
    label: string;
    category: "salary" | "other" | "dividends" | "rent" | "freelance";
    amount: number;
    owner: string | null;
    notes?: string;
  }> = [
    { label: "Salaire Alex", category: "salary", amount: 3_620, owner: m1.id, notes: "Net mensuel · CDI" },
    { label: "Salaire Sam", category: "salary", amount: 3_280, owner: m2.id },
    { label: "Allocations familiales", category: "other", amount: 215, owner: null },
    { label: "Dividendes trimestriels", category: "dividends", amount: 45, owner: m1.id, notes: "Moyenne mensualisée" },
  ];
  for (const i of incomes) {
    await db.insert(schema.recurringIncome).values({
      householdId,
      label: i.label,
      category: i.category,
      amount: i.amount,
      ownership: i.owner ? "member" : "shared",
      ownerMemberId: i.owner,
      startDate: new Date(2023, 0, 1),
      notes: i.notes ?? null,
    });
  }

  console.log("→ recurring expenses (16 lines)…");
  const expenses = [
    { label: "Alimentation & courses", category: "food", amount: 720, notes: "Supermarchés + marché" },
    { label: "Restaurants & à-emporter", category: "leisure", amount: 210 },
    { label: "Carburant", category: "transport", amount: 165 },
    { label: "Transports publics", category: "transport", amount: 56, notes: "Abonnement annuel amorti" },
    { label: "Électricité", category: "utilities", amount: 135, notes: "Contrat variable" },
    { label: "Gaz", category: "utilities", amount: 92 },
    { label: "Eau", category: "utilities", amount: 28 },
    { label: "Internet + mobile ménage", category: "subscriptions", amount: 75 },
    { label: "Abonnements streaming", category: "subscriptions", amount: 42, notes: "À mutualiser — réviser en T3" },
    { label: "Salle de sport Alex", category: "subscriptions", amount: 39 },
    { label: "Assurance habitation", category: "insurance", amount: 48 },
    { label: "Assurance auto", category: "insurance", amount: 82 },
    { label: "Mutuelle santé", category: "health", amount: 54 },
    { label: "Crèche enfant", category: "childcare", amount: 410, notes: "Gratuit l'été" },
    { label: "Dons mensuels", category: "other", amount: 20 },
    { label: "Épargne étude enfant", category: "other", amount: 75, notes: "Compte dédié ouvert 2023-09" },
  ] as const;

  const expenseRows: { id: string; baseline: number }[] = [];
  for (const e of expenses) {
    const [row] = await db
      .insert(schema.recurringExpense)
      .values({
        householdId,
        label: e.label,
        category: e.category,
        amount: e.amount,
        ownership: "shared",
        startDate: new Date(2023, 0, 1),
        notes: "notes" in e ? (e.notes as string) : null,
      })
      .returning();
    expenseRows.push({ id: row.id, baseline: e.amount });
  }

  console.log("→ expense actuals (18 months)…");
  for (let m = 17; m >= 0; m--) {
    const d = monthsAgo(m);
    const key = ym(d);
    for (const e of expenseRows) {
      // Seasonality on a few categories: electricity higher in winter, food stable, leisure summer peaks
      const seasonFactor = 1 + Math.sin((d.getMonth() / 12) * Math.PI * 2) * 0.06;
      await db.insert(schema.recurringExpenseActual).values({
        expenseId: e.id,
        month: key,
        amount: jitter(e.baseline * seasonFactor, 0.08),
        notes: null,
      });
    }
  }

  console.log("→ one-off charges (~2 years)…");
  const pastCharges: Array<{
    label: string;
    category:
      | "notary" | "registration_tax" | "credit_fees" | "expertise"
      | "mortgage_insurance" | "renovation" | "furniture" | "moving"
      | "tax" | "legal" | "other";
    amount: number;
    daysAgo: number;
  }> = [
    { label: "Droits d'enregistrement", category: "registration_tax", amount: 14_350, daysAgo: 680 },
    { label: "Frais de notaire", category: "notary", amount: 4_820, daysAgo: 680 },
    { label: "Frais de dossier crédit", category: "credit_fees", amount: 350, daysAgo: 675 },
    { label: "Assurance solde restant dû", category: "mortgage_insurance", amount: 3_240, daysAgo: 670 },
    { label: "Déménagement + taxi", category: "moving", amount: 880, daysAgo: 640 },
    { label: "Rénovation salle de bains", category: "renovation", amount: 6_950, daysAgo: 420 },
    { label: "Cuisine équipée", category: "furniture", amount: 7_200, daysAgo: 380 },
    { label: "Chauffe-eau remplacement", category: "renovation", amount: 1_450, daysAgo: 300 },
    { label: "Impôt précompte immobilier", category: "tax", amount: 1_180, daysAgo: 250 },
    { label: "Contrôle technique + réparations", category: "other", amount: 385, daysAgo: 150 },
    { label: "Assurance auto annuelle (ajustement)", category: "other", amount: 180, daysAgo: 110 },
    { label: "Impôt précompte immobilier", category: "tax", amount: 1_215, daysAgo: 90 },
    { label: "Entretien chaudière", category: "other", amount: 195, daysAgo: 55 },
    { label: "Pneus hiver", category: "other", amount: 640, daysAgo: 38 },
    { label: "Réparation lave-vaisselle", category: "other", amount: 215, daysAgo: 18 },
  ];
  for (const c of pastCharges) {
    await db.insert(schema.oneOffCharge).values({
      householdId,
      date: daysAgoDate(c.daysAgo),
      label: c.label,
      category: c.category,
      amount: c.amount,
      includeInCostBasis: true,
      notes: null,
    });
  }

  console.log("→ charge templates…");
  for (const t of [
    { label: "Entretien chaudière", category: "other" as const, defaultAmount: 195 },
    { label: "Contrôle technique", category: "other" as const, defaultAmount: 45 },
    { label: "Vidange voiture", category: "other" as const, defaultAmount: 135 },
    { label: "Impôt précompte immobilier", category: "tax" as const, defaultAmount: 1_200 },
    { label: "Franchise assurance auto", category: "other" as const, defaultAmount: 250 },
  ]) {
    await db.insert(schema.chargeTemplate).values({
      householdId,
      label: t.label,
      category: t.category,
      defaultAmount: t.defaultAmount,
      lastUsedAt: new Date(),
    });
  }

  console.log("→ one-off incomes…");
  const pastIncomes: Array<{
    label: string;
    category:
      | "bonus" | "freelance" | "gift" | "refund" | "tax_refund"
      | "dividend" | "sale" | "inheritance" | "other";
    amount: number;
    daysAgo: number;
  }> = [
    { label: "Prime annuelle Alex", category: "bonus", amount: 2_800, daysAgo: 480 },
    { label: "Remboursement fiscal", category: "tax_refund", amount: 1_340, daysAgo: 380 },
    { label: "Vente vélo d'occasion", category: "sale", amount: 320, daysAgo: 270 },
    { label: "Prime annuelle Alex", category: "bonus", amount: 2_950, daysAgo: 120 },
    { label: "Cadeau anniversaire famille", category: "gift", amount: 250, daysAgo: 80 },
    { label: "Remboursement mutuelle", category: "refund", amount: 95, daysAgo: 42 },
    { label: "Dividende trimestriel exceptionnel", category: "dividend", amount: 180, daysAgo: 22 },
  ];
  for (const i of pastIncomes) {
    await db.insert(schema.oneOffIncome).values({
      householdId,
      date: daysAgoDate(i.daysAgo),
      label: i.label,
      category: i.category,
      amount: i.amount,
      notes: null,
    });
  }

  console.log("→ income templates…");
  for (const t of [
    { label: "Prime annuelle Alex", category: "bonus" as const, defaultAmount: 2_900 },
    { label: "Remboursement fiscal", category: "tax_refund" as const, defaultAmount: 1_200 },
    { label: "Remboursement mutuelle", category: "refund" as const, defaultAmount: 90 },
  ]) {
    await db.insert(schema.incomeTemplate).values({
      householdId,
      label: t.label,
      category: t.category,
      defaultAmount: t.defaultAmount,
      lastUsedAt: new Date(),
    });
  }

  console.log("→ holdings (brokerage wallet — 8 ETF)…");
  const etfs = [
    { ticker: "WRLD", isin: "XF00WRLDCORE1", name: "Core World Equities (Acc)", allocation: 35 },
    { ticker: "EMRG", isin: "XF00EMRGMKT01", name: "Emerging Markets IMI", allocation: 12 },
    { ticker: "EUST", isin: "XF00EUSTCX500", name: "Europe Stoxx 600", allocation: 10 },
    { ticker: "NAS1", isin: "XF00NDQ100ACC", name: "Nasdaq-100 Tech Leaders", allocation: 12 },
    { ticker: "QUAL", isin: "XF00QUALFACT1", name: "Quality Factor (Acc)", allocation: 10 },
    { ticker: "REIT", isin: "XF00REITGLOB1", name: "Global Real Estate", allocation: 6 },
    { ticker: "COMM", isin: "XF00COMMODBAS", name: "Diversified Commodities", allocation: 5 },
    { ticker: "BOND", isin: "XF00IGCORPEU1", name: "Investment-Grade EUR Bonds", allocation: 10 },
  ];
  for (const e of etfs) {
    await db.insert(schema.holding).values({
      accountId: brokerage.id,
      ticker: e.ticker,
      isin: e.isin,
      name: e.name,
      allocationPct: e.allocation,
      quantity: 0,
      avgCost: 0,
      currentPrice: 0,
      currency: "EUR",
    });
  }

  console.log("→ net worth + per-account snapshots (24 months)…");
  // Monthly drifts per account, applied going backwards from today's value.
  const monthlyDrift: Record<string, number> = {
    [cash.id]: 25,
    [savings.id]: 680,
    [emergency.id]: 120,
    [brokerage.id]: 410,
    [retirement.id]: 135,
    [crypto.id]: 55,
    [realEstate.id]: 720, // appreciation
    [loan.id]: 720, // loan becomes less negative over time → going back it's more negative
    [creditCard.id]: 0,
  };

  for (let i = 23; i >= 0; i--) {
    const d = endOfMonth(monthsAgo(i));
    let assets = 0;
    let liabilities = 0;
    const byKind: Record<string, number> = {};

    for (const a of allAccounts) {
      let value: number;
      if (a.kind === "loan") {
        value = a.currentValue - i * monthlyDrift[a.id];
      } else if (a.kind === "credit_card") {
        // Credit card oscillates ±1000 around 0-1500
        value = Math.round(-800 - Math.sin((i / 3) * Math.PI) * 500);
      } else {
        value = a.currentValue - i * (monthlyDrift[a.id] ?? 0);
      }

      // Add some monthly jitter to look natural (not for loan / property which are smooth)
      if (a.kind !== "loan" && a.kind !== "real_estate") {
        value = jitter(value, 0.015);
      }
      value = Math.round(value);
      if (value === 0 && a.kind === "credit_card") value = -450;

      byKind[a.kind] = (byKind[a.kind] ?? 0) + value;
      if (a.kind === "loan" || a.kind === "credit_card" || value < 0) {
        liabilities += Math.abs(value);
      } else {
        assets += value;
      }
      await db.insert(schema.accountSnapshot).values({
        accountId: a.id,
        date: d,
        value,
      });
    }

    await db.insert(schema.netWorthSnapshot).values({
      householdId,
      date: d,
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: assets - liabilities,
      breakdown: JSON.stringify(byKind),
    });
  }

  console.log("→ projection scenarios…");
  await db.insert(schema.projectionScenario).values({
    householdId,
    name: "Base",
    inflationPct: 2,
    stockReturnPct: 7,
    cashReturnPct: 2.75,
    propertyAppreciationPct: 2,
    horizonYears: 30,
    isDefault: true,
  });
  await db.insert(schema.projectionScenario).values({
    householdId,
    name: "Optimiste",
    inflationPct: 1.8,
    stockReturnPct: 9,
    cashReturnPct: 3.25,
    propertyAppreciationPct: 2.8,
    horizonYears: 30,
    isDefault: false,
  });
  await db.insert(schema.projectionScenario).values({
    householdId,
    name: "Prudent",
    inflationPct: 2.5,
    stockReturnPct: 4.5,
    cashReturnPct: 2,
    propertyAppreciationPct: 1.2,
    horizonYears: 30,
    isDefault: false,
  });

  console.log("✓ demo seed complete — fully fictional data.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
