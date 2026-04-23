/**
 * Idempotent demo seed. Wipes the DB, then inserts a rich, realistic Belgian
 * household so the demo page at demo.wallet.huberty.pro showcases everything.
 *
 *   DATABASE_URL=... npx tsx scripts/seed-demo.ts
 */
import "dotenv/config";
import { db, schema } from "@/db";
import { nanoid } from "nanoid";

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
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0, 0);
  return e;
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
  for (const t of tables) {
    await db.delete(t);
  }
}

async function main() {
  await wipe();

  console.log("→ creating demo user + household…");
  const userId = "demo-user-" + nanoid(6);
  await db.insert(schema.user).values({
    id: userId,
    email: "demo@wallet.huberty.pro",
    emailVerified: true,
    name: "Démo Family",
  });
  const [hh] = await db
    .insert(schema.household)
    .values({
      userId,
      name: "Démo Family",
      baseCurrency: "EUR",
    })
    .returning();
  const householdId = hh.id;

  console.log("→ members…");
  const [m1] = await db
    .insert(schema.member)
    .values({
      householdId,
      name: "Alice",
      email: "alice@demo",
      color: "#C75C2C",
    })
    .returning();
  const [m2] = await db
    .insert(schema.member)
    .values({
      householdId,
      name: "Benjamin",
      email: "ben@demo",
      color: "#2B4A3B",
    })
    .returning();

  console.log("→ accounts…");
  const [cash] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Compte courant BNP",
      kind: "cash",
      institution: "BNP Paribas Fortis",
      currentValue: 3_240,
      ownership: "shared",
      sharedSplitPct: 50,
      annualYieldPct: 0,
    })
    .returning();
  const [savings] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Épargne ING",
      kind: "savings",
      institution: "ING Belgium",
      currentValue: 18_938,
      ownership: "shared",
      sharedSplitPct: 50,
      annualYieldPct: 2.5,
      monthlyContribution: 500,
    })
    .returning();
  const [brokerage] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Portefeuille Revolut",
      kind: "brokerage",
      institution: "Revolut",
      currentValue: 12_470,
      ownership: "member",
      ownerMemberId: m1.id,
      annualYieldPct: 7,
      monthlyContribution: 300,
    })
    .returning();
  const [retirement] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Épargne-pension",
      kind: "retirement",
      institution: "Belfius",
      currentValue: 8_420,
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
      institution: "Kraken",
      currentValue: 2_850,
      ownership: "member",
      ownerMemberId: m1.id,
      annualYieldPct: 12,
      monthlyContribution: 50,
    })
    .returning();
  const [realEstate] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Maison Bomal",
      kind: "real_estate",
      institution: "—",
      currentValue: 546_000,
      ownership: "shared",
      sharedSplitPct: 50,
    })
    .returning();
  const [loan] = await db
    .insert(schema.account)
    .values({
      householdId,
      name: "Prêt — Maison Bomal",
      kind: "loan",
      institution: "Crelan",
      currentValue: -312_000,
      ownership: "shared",
      sharedSplitPct: 50,
    })
    .returning();

  console.log("→ property + mortgage + amortization…");
  const purchaseDate = new Date(2024, 6, 31);
  const [property] = await db
    .insert(schema.property)
    .values({
      accountId: realEstate.id,
      address: "Rue du Château 12, 6941 Bomal-sur-Ourthe",
      purchasePrice: 525_000,
      purchaseDate,
      currentValue: 546_000,
      annualAppreciationPct: 2.0,
      monthlyFees: 45,
      surfaceSqm: 185,
    })
    .returning();
  const mortgageStart = new Date(2024, 7, 1);
  const [mortgage] = await db
    .insert(schema.mortgage)
    .values({
      accountId: loan.id,
      propertyId: property.id,
      lender: "Crelan",
      principal: 320_000,
      interestRatePct: 3.14,
      termMonths: 240,
      startDate: mortgageStart,
      monthlyPayment: 1_752,
      remainingBalance: 312_000,
    })
    .returning();
  // Amortization: 240 entries starting from mortgageStart
  const rate = 3.14 / 100 / 12;
  let balance = 320_000;
  const payment = 1_752;
  for (let i = 0; i < 240; i++) {
    const interest = balance * rate;
    const principalPaid = Math.max(0, payment - interest);
    balance = Math.max(0, balance - principalPaid);
    const due = new Date(mortgageStart);
    due.setMonth(due.getMonth() + i);
    await db.insert(schema.amortizationEntry).values({
      mortgageId: mortgage.id,
      dueDate: due,
      payment,
      principal: Number(principalPaid.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      balance: Number(balance.toFixed(2)),
    });
  }

  console.log("→ recurring incomes + expenses…");
  const incomes = [
    { label: "Salaire Alice", category: "salary", amount: 3_450, owner: m1.id },
    { label: "Salaire Benjamin", category: "salary", amount: 3_200, owner: m2.id },
    { label: "Allocations familiales", category: "other", amount: 180, owner: null },
  ] as const;
  for (const i of incomes) {
    await db.insert(schema.recurringIncome).values({
      householdId,
      label: i.label,
      category: i.category,
      amount: i.amount,
      ownership: i.owner ? "member" : "shared",
      ownerMemberId: i.owner,
      startDate: new Date(2024, 0, 1),
      notes: null,
    });
  }

  const expenses = [
    { label: "Courses alimentaires", category: "food", amount: 650, notes: "Carrefour + Delhaize + marché" },
    { label: "Restaurants & sorties", category: "leisure", amount: 280 },
    { label: "Carburant", category: "transport", amount: 175 },
    { label: "Électricité", category: "utilities", amount: 125, notes: "Contrat variable Engie" },
    { label: "Gaz", category: "utilities", amount: 85 },
    { label: "Eau", category: "utilities", amount: 22 },
    { label: "Assurance auto", category: "insurance", amount: 78 },
    { label: "Assurance habitation", category: "insurance", amount: 42 },
    { label: "Internet + Mobile (Orange)", category: "subscriptions", amount: 78 },
    { label: "Netflix / Spotify / ChatGPT", category: "subscriptions", amount: 37, notes: "à réviser tous les 6 mois" },
    { label: "Crèche Léo", category: "childcare", amount: 385 },
    { label: "Mutuelle", category: "health", amount: 48 },
    { label: "Abonnement salle de sport", category: "subscriptions", amount: 39 },
  ] as const;
  const expenseIds: { id: string; amount: number }[] = [];
  for (const e of expenses) {
    const [row] = await db
      .insert(schema.recurringExpense)
      .values({
        householdId,
        label: e.label,
        category: e.category,
        amount: e.amount,
        ownership: "shared",
        startDate: new Date(2024, 0, 1),
        notes: "notes" in e ? (e.notes as string) : null,
      })
      .returning();
    expenseIds.push({ id: row.id, amount: e.amount });
  }

  console.log("→ expense actuals (last 9 months)…");
  for (let m = 8; m >= 0; m--) {
    const d = monthsAgo(m);
    const key = ym(d);
    for (const e of expenseIds) {
      const jitter = (Math.random() - 0.5) * 0.15; // ±7.5%
      const amount = Math.round(e.amount * (1 + jitter));
      await db.insert(schema.recurringExpenseActual).values({
        expenseId: e.id,
        month: key,
        amount,
        notes: null,
      });
    }
  }

  console.log("→ one-off charges (last 12 months)…");
  const pastCharges = [
    { label: "Droits d'enregistrement", category: "registration_tax", amount: 19_110, daysAgo: 280 },
    { label: "Notaire — frais et honoraires", category: "notary", amount: 5_635, daysAgo: 280 },
    { label: "Frais de dossier crédit", category: "credit_fees", amount: 350, daysAgo: 280 },
    { label: "Assurance solde restant dû (prime unique)", category: "mortgage_insurance", amount: 4_269, daysAgo: 279 },
    { label: "Travaux salle de bains", category: "renovation", amount: 8_420, daysAgo: 210 },
    { label: "Cuisine équipée", category: "furniture", amount: 6_200, daysAgo: 180 },
    { label: "Impôt précompte immobilier", category: "tax", amount: 1_240, daysAgo: 95 },
    { label: "Entretien chaudière", category: "other", amount: 180, daysAgo: 45 },
    { label: "Vidange voiture", category: "other", amount: 135, daysAgo: 21 },
  ] as const;
  for (const c of pastCharges) {
    const d = new Date();
    d.setDate(d.getDate() - c.daysAgo);
    d.setHours(12, 0, 0, 0);
    await db.insert(schema.oneOffCharge).values({
      householdId,
      date: d,
      label: c.label,
      category: c.category,
      amount: c.amount,
      includeInCostBasis: true,
      notes: null,
    });
  }

  console.log("→ charge templates…");
  for (const t of [
    { label: "Entretien chaudière", category: "other", defaultAmount: 180 },
    { label: "Vidange voiture", category: "other", defaultAmount: 135 },
    { label: "Impôt précompte immobilier", category: "tax", defaultAmount: 1_240 },
    { label: "Contrôle technique", category: "other", defaultAmount: 45 },
  ] as const) {
    await db.insert(schema.chargeTemplate).values({
      householdId,
      label: t.label,
      category: t.category,
      defaultAmount: t.defaultAmount,
      notes: null,
      lastUsedAt: new Date(),
    });
  }

  console.log("→ one-off incomes…");
  const pastIncomes = [
    { label: "13e mois Alice", category: "bonus", amount: 2_400, daysAgo: 180 },
    { label: "Prime fin d'année Benjamin", category: "bonus", amount: 2_100, daysAgo: 95 },
    { label: "Vente vélo d'occasion", category: "sale", amount: 340, daysAgo: 60 },
    { label: "Remboursement mutuelle", category: "refund", amount: 86, daysAgo: 18 },
  ] as const;
  for (const i of pastIncomes) {
    const d = new Date();
    d.setDate(d.getDate() - i.daysAgo);
    d.setHours(12, 0, 0, 0);
    await db.insert(schema.oneOffIncome).values({
      householdId,
      date: d,
      label: i.label,
      category: i.category,
      amount: i.amount,
      notes: null,
    });
  }
  for (const t of [
    { label: "13e mois Alice", category: "bonus", defaultAmount: 2_400 },
    { label: "Remboursement mutuelle", category: "refund", defaultAmount: 80 },
  ] as const) {
    await db.insert(schema.incomeTemplate).values({
      householdId,
      label: t.label,
      category: t.category,
      defaultAmount: t.defaultAmount,
      notes: null,
      lastUsedAt: new Date(),
    });
  }

  console.log("→ holdings (Revolut wallet)…");
  const etfs = [
    { ticker: "IWDA", isin: "IE00B4L5Y983", name: "iShares Core MSCI World", allocation: 45 },
    { ticker: "EMIM", isin: "IE00BKM4GZ66", name: "iShares Core MSCI EM IMI", allocation: 15 },
    { ticker: "IS3Q", isin: "IE00BP3QZ601", name: "iShares Edge MSCI World Quality", allocation: 15 },
    { ticker: "XDWT", isin: "IE00BM67HT60", name: "Xtrackers MSCI World Info Tech", allocation: 10 },
    { ticker: "LYMS", isin: "LU1829221024", name: "Amundi Nasdaq-100 II", allocation: 10 },
    { ticker: "IS3K", isin: "IE00BCRY6003", name: "iShares High Yield Corp Bond", allocation: 5 },
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

  console.log("→ net worth + per-account snapshots (12 months)…");
  const drift = {
    [cash.id]: 0,
    [savings.id]: 420,
    [brokerage.id]: 280,
    [retirement.id]: 105,
    [crypto.id]: 40,
    [realEstate.id]: 900,
    [loan.id]: 900, // +900 each month = -900 on the balance (loan gets less negative)
  } as Record<string, number>;
  for (let i = 11; i >= 0; i--) {
    const d = endOfMonth(monthsAgo(i));
    let assets = 0;
    let liabilities = 0;
    const byKind: Record<string, number> = {};

    // Back-compute each account value at this point
    const allAccounts = [cash, savings, brokerage, retirement, crypto, realEstate, loan];
    for (const a of allAccounts) {
      const distance = i; // months before today
      let value: number;
      if (a.kind === "loan") {
        // Current value is -312000. Each month back, balance was 900€ higher (less paid down).
        value = a.currentValue - distance * 900; // more negative going back
      } else {
        value = a.currentValue - distance * drift[a.id];
      }
      value = Math.round(value);
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

  console.log("→ projection scenario…");
  await db.insert(schema.projectionScenario).values({
    householdId,
    name: "Default",
    inflationPct: 2,
    stockReturnPct: 7,
    cashReturnPct: 2.5,
    propertyAppreciationPct: 2,
    horizonYears: 30,
    isDefault: true,
  });

  console.log("✓ demo seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
