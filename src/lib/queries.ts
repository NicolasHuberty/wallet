import { db, schema } from "@/db";
import { eq, asc, and, gt, lt, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { isLiability } from "./labels";
import { auth } from "./auth";
import { DEMO_MODE, DEMO_EMAIL, DEMO_NAME } from "./demo";

export async function getPrimaryHousehold() {
  // Demo mode: return the seeded demo household, no auth.
  if (DEMO_MODE) {
    const rows = await db
      .select()
      .from(schema.household)
      .orderBy(asc(schema.household.createdAt))
      .limit(1);
    if (rows.length === 0)
      throw new Error("Demo seed manquant — run npm run db:seed-demo");
    return rows[0];
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Non authentifié — redirection vers /login");
  }

  // One household per user (auto-created on signup via better-auth hook).
  const owned = await db
    .select()
    .from(schema.household)
    .where(eq(schema.household.userId, session.user.id))
    .limit(1);
  if (owned.length > 0) return owned[0];

  // Backfill if hook ever missed.
  const [created] = await db
    .insert(schema.household)
    .values({
      userId: session.user.id,
      name: session.user.name || session.user.email.split("@")[0],
      baseCurrency: "EUR",
    })
    .returning();
  return created;
}

export async function getCurrentUser() {
  if (DEMO_MODE) {
    return {
      id: "demo",
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function getHouseholdMembers(householdId: string) {
  return db.select().from(schema.member).where(eq(schema.member.householdId, householdId)).orderBy(asc(schema.member.createdAt));
}

export async function getAccounts(householdId: string) {
  return db.select().from(schema.account).where(eq(schema.account.householdId, householdId));
}

export async function getNetWorth(householdId: string) {
  const accounts = await getAccounts(householdId);
  let assets = 0;
  let liabilities = 0;
  const byKind: Record<string, number> = {};
  for (const a of accounts) {
    const v = a.currentValue;
    byKind[a.kind] = (byKind[a.kind] ?? 0) + v;
    if (isLiability(a.kind) || v < 0) {
      liabilities += Math.abs(v);
    } else {
      assets += v;
    }
  }
  return { assets, liabilities, netWorth: assets - liabilities, byKind };
}

export async function getActiveMortgages(householdId: string) {
  const accounts = await getAccounts(householdId);
  const loanAccounts = accounts.filter((a) => a.kind === "loan" && !a.archivedAt);
  const loanAccountIds = loanAccounts.map((a) => a.id);
  if (loanAccountIds.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.mortgage)
    .where(
      and(
        inArray(schema.mortgage.accountId, loanAccountIds),
        gt(schema.mortgage.remainingBalance, 0),
      ),
    );
  const accountById = new Map(loanAccounts.map((a) => [a.id, a]));
  return rows.map((m) => ({
    mortgage: m,
    account: accountById.get(m.accountId)!,
  }));
}

export async function getMonthlyCashflow(householdId: string) {
  const incomes = await db.select().from(schema.recurringIncome).where(eq(schema.recurringIncome.householdId, householdId));
  const expenses = await db.select().from(schema.recurringExpense).where(eq(schema.recurringExpense.householdId, householdId));
  const mortgages = await getActiveMortgages(householdId);
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalManualExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalMortgage = mortgages.reduce((s, m) => s + m.mortgage.monthlyPayment, 0);
  const totalExpense = totalManualExpense + totalMortgage;
  return { totalIncome, totalExpense, totalManualExpense, totalMortgage, net: totalIncome - totalExpense };
}

export async function getSnapshots(householdId: string) {
  return db
    .select()
    .from(schema.netWorthSnapshot)
    .where(eq(schema.netWorthSnapshot.householdId, householdId))
    .orderBy(asc(schema.netWorthSnapshot.date));
}

export async function getHoldings(accountId: string) {
  return db.select().from(schema.holding).where(eq(schema.holding.accountId, accountId));
}

export async function getDcaPlans(householdId: string) {
  const accs = await getAccounts(householdId);
  const accIds = accs.map((a) => a.id);
  if (accIds.length === 0) return [];
  return db.select().from(schema.dcaPlan).where(inArray(schema.dcaPlan.accountId, accIds));
}

export async function getProperties(householdId: string) {
  const accs = await getAccounts(householdId);
  const realEstateAccs = accs.filter((a) => a.kind === "real_estate");
  if (realEstateAccs.length === 0) {
    return [] as Array<{
      account: typeof accs[number];
      property: typeof schema.property.$inferSelect;
      mortgage: typeof schema.mortgage.$inferSelect | null;
    }>;
  }
  const accIds = realEstateAccs.map((a) => a.id);

  // Batch fetch: all properties for these accounts + all mortgages for those
  // properties in two queries instead of 2×N.
  const properties = await db
    .select()
    .from(schema.property)
    .where(inArray(schema.property.accountId, accIds));
  const propIds = properties.map((p) => p.id);
  const mortgages = propIds.length
    ? await db
        .select()
        .from(schema.mortgage)
        .where(inArray(schema.mortgage.propertyId, propIds))
    : [];

  const propByAccount = new Map(properties.map((p) => [p.accountId, p]));
  const mortgageByProperty = new Map<string, typeof schema.mortgage.$inferSelect>();
  for (const m of mortgages) {
    if (m.propertyId && !mortgageByProperty.has(m.propertyId)) {
      mortgageByProperty.set(m.propertyId, m);
    }
  }

  const result: Array<{
    account: typeof accs[number];
    property: typeof schema.property.$inferSelect;
    mortgage: typeof schema.mortgage.$inferSelect | null;
  }> = [];
  for (const a of realEstateAccs) {
    const p = propByAccount.get(a.id);
    if (!p) continue;
    result.push({ account: a, property: p, mortgage: mortgageByProperty.get(p.id) ?? null });
  }
  return result;
}

export async function getRecurringExpenses(householdId: string) {
  return db.select().from(schema.recurringExpense).where(eq(schema.recurringExpense.householdId, householdId));
}

export async function getRecurringIncomes(householdId: string) {
  return db.select().from(schema.recurringIncome).where(eq(schema.recurringIncome.householdId, householdId));
}

export async function getCharges(householdId: string) {
  return db.select().from(schema.oneOffCharge).where(eq(schema.oneOffCharge.householdId, householdId));
}

export async function getPropertyCharges(propertyId: string) {
  return db.select().from(schema.oneOffCharge).where(eq(schema.oneOffCharge.propertyId, propertyId));
}

export async function getDefaultScenario(householdId: string) {
  const rows = await db.select().from(schema.projectionScenario).where(eq(schema.projectionScenario.householdId, householdId));
  return rows.find((s) => s.isDefault) ?? rows[0] ?? null;
}

export async function getAccount(accountId: string) {
  const rows = await db.select().from(schema.account).where(eq(schema.account.id, accountId));
  return rows[0] ?? null;
}

export async function getAccountSnapshots(accountId: string) {
  return db
    .select()
    .from(schema.accountSnapshot)
    .where(eq(schema.accountSnapshot.accountId, accountId))
    .orderBy(asc(schema.accountSnapshot.date));
}

/**
 * Batch variant of {@link getAccountSnapshots}: fetches all snapshots for the
 * given accounts in a single SQL query and groups them by `accountId` in JS.
 * Accounts with no snapshots appear as empty arrays in the returned map.
 */
export async function getSnapshotsForAccounts(
  accountIds: string[],
): Promise<Map<string, typeof schema.accountSnapshot.$inferSelect[]>> {
  const out = new Map<string, typeof schema.accountSnapshot.$inferSelect[]>();
  for (const id of accountIds) out.set(id, []);
  if (accountIds.length === 0) return out;
  const rows = await db
    .select()
    .from(schema.accountSnapshot)
    .where(inArray(schema.accountSnapshot.accountId, accountIds))
    .orderBy(asc(schema.accountSnapshot.date));
  for (const r of rows) {
    const bucket = out.get(r.accountId);
    if (bucket) bucket.push(r);
    else out.set(r.accountId, [r]);
  }
  return out;
}

export async function getExpenseActualsByHousehold(householdId: string) {
  const expenses = await db
    .select({ id: schema.recurringExpense.id })
    .from(schema.recurringExpense)
    .where(eq(schema.recurringExpense.householdId, householdId));
  const expenseIds = expenses.map((e) => e.id);
  if (expenseIds.length === 0) return [] as typeof schema.recurringExpenseActual.$inferSelect[];
  return db
    .select()
    .from(schema.recurringExpenseActual)
    .where(inArray(schema.recurringExpenseActual.expenseId, expenseIds));
}

export async function getChargeTemplates(householdId: string) {
  return db
    .select()
    .from(schema.chargeTemplate)
    .where(eq(schema.chargeTemplate.householdId, householdId));
}

export async function getOneOffIncomes(householdId: string) {
  return db
    .select()
    .from(schema.oneOffIncome)
    .where(eq(schema.oneOffIncome.householdId, householdId));
}

export async function getIncomeTemplates(householdId: string) {
  return db
    .select()
    .from(schema.incomeTemplate)
    .where(eq(schema.incomeTemplate.householdId, householdId));
}

/**
 * For each account belonging to a household, returns the most recent
 * {@link schema.accountSnapshot} whose date is strictly before `monthStart`.
 * Accounts without any prior snapshot are omitted from the returned map.
 *
 * Used by the check-in form to pre-fill the "Avant" column with the value at
 * the end of the month preceding the check-in, rather than the always-current
 * `account.currentValue`.
 */
export async function getLastAccountSnapshotsBeforeMonth(
  householdId: string,
  monthStart: Date,
): Promise<
  Record<string, { value: number; date: Date }>
> {
  const accounts = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(eq(schema.account.householdId, householdId));
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return {};

  const rows = await db
    .select()
    .from(schema.accountSnapshot)
    .where(
      and(
        inArray(schema.accountSnapshot.accountId, ids),
        lt(schema.accountSnapshot.date, monthStart),
      ),
    )
    .orderBy(asc(schema.accountSnapshot.date));

  const out: Record<string, { value: number; date: Date }> = {};
  for (const r of rows) {
    const d = r.date as unknown as Date;
    out[r.accountId] = { value: r.value, date: d };
  }
  return out;
}
