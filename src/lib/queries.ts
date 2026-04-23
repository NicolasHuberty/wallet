import { db, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import { headers } from "next/headers";
import { isLiability } from "./labels";
import { auth } from "./auth";

export async function getPrimaryHousehold() {
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
  const loanAccountIds = accounts.filter((a) => a.kind === "loan" && !a.archivedAt).map((a) => a.id);
  if (loanAccountIds.length === 0) return [];
  const rows = await db.select().from(schema.mortgage);
  return rows
    .filter((m) => loanAccountIds.includes(m.accountId) && m.remainingBalance > 0)
    .map((m) => ({
      mortgage: m,
      account: accounts.find((a) => a.id === m.accountId)!,
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
  return db.select().from(schema.dcaPlan);
}

export async function getProperties(householdId: string) {
  const accs = await getAccounts(householdId);
  const result: Array<{ account: typeof accs[number]; property: typeof schema.property.$inferSelect; mortgage: typeof schema.mortgage.$inferSelect | null }> = [];
  for (const a of accs) {
    if (a.kind !== "real_estate") continue;
    const [p] = await db.select().from(schema.property).where(eq(schema.property.accountId, a.id));
    if (!p) continue;
    const loans = await db.select().from(schema.mortgage).where(eq(schema.mortgage.propertyId, p.id));
    const m = loans[0] ?? null;
    result.push({ account: a, property: p, mortgage: m });
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

export async function getExpenseActualsByHousehold(householdId: string) {
  const expenses = await db
    .select()
    .from(schema.recurringExpense)
    .where(eq(schema.recurringExpense.householdId, householdId));
  const expenseIds = expenses.map((e) => e.id);
  if (expenseIds.length === 0) return [] as typeof schema.recurringExpenseActual.$inferSelect[];
  const actuals = await db.select().from(schema.recurringExpenseActual);
  return actuals.filter((a) => expenseIds.includes(a.expenseId));
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
