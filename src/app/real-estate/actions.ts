"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeSnapshot } from "@/lib/snapshots";

const propertySchema = z.object({
  id: z.string().optional(),
  householdId: z.string(),
  accountId: z.string().optional(),
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  purchasePrice: z.coerce.number(),
  purchaseDate: z.string(),
  currentValue: z.coerce.number(),
  annualAppreciationPct: z.coerce.number(),
  monthlyFees: z.coerce.number(),
  surfaceSqm: z.coerce.number().optional().nullable(),
});

export async function saveProperty(values: z.infer<typeof propertySchema>) {
  const p = propertySchema.parse(values);
  if (p.id) {
    const [existing] = await db.select().from(schema.property).where(eq(schema.property.id, p.id));
    if (!existing) throw new Error("Introuvable");
    await db.update(schema.account).set({ name: p.name, currentValue: p.currentValue, updatedAt: new Date() }).where(eq(schema.account.id, existing.accountId));
    await db.update(schema.property).set({
      address: p.address || null,
      purchasePrice: p.purchasePrice,
      purchaseDate: new Date(p.purchaseDate),
      currentValue: p.currentValue,
      annualAppreciationPct: p.annualAppreciationPct,
      monthlyFees: p.monthlyFees,
      surfaceSqm: p.surfaceSqm || null,
      updatedAt: new Date(),
    }).where(eq(schema.property.id, p.id));
  } else {
    const [acc] = await db.insert(schema.account).values({
      householdId: p.householdId,
      name: p.name,
      kind: "real_estate",
      currentValue: p.currentValue,
      ownership: "shared",
      sharedSplitPct: 50,
    }).returning();
    await db.insert(schema.property).values({
      accountId: acc.id,
      address: p.address || null,
      purchasePrice: p.purchasePrice,
      purchaseDate: new Date(p.purchaseDate),
      currentValue: p.currentValue,
      annualAppreciationPct: p.annualAppreciationPct,
      monthlyFees: p.monthlyFees,
      surfaceSqm: p.surfaceSqm || null,
    });
  }
  await recomputeSnapshot(p.householdId);
  revalidatePath("/real-estate");
  revalidatePath("/");
  revalidatePath("/accounts");
}

export async function deleteProperty(accountId: string) {
  const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, accountId));
  await db.delete(schema.account).where(eq(schema.account.id, accountId));
  if (acc) await recomputeSnapshot(acc.householdId);
  revalidatePath("/real-estate");
  revalidatePath("/");
  revalidatePath("/accounts");
}

const mortgageSchema = z.object({
  id: z.string().optional(),
  householdId: z.string(),
  propertyId: z.string().optional().nullable(),
  name: z.string().min(1),
  lender: z.string().optional().nullable(),
  principal: z.coerce.number(),
  interestRatePct: z.coerce.number(),
  termMonths: z.coerce.number().int(),
  startDate: z.string(),
  monthlyPayment: z.coerce.number(),
  remainingBalance: z.coerce.number(),
});

export async function saveMortgage(values: z.infer<typeof mortgageSchema>) {
  const m = mortgageSchema.parse(values);
  if (m.id) {
    const [existing] = await db.select().from(schema.mortgage).where(eq(schema.mortgage.id, m.id));
    if (!existing) throw new Error("Introuvable");
    await db.update(schema.account).set({ name: m.name, currentValue: -m.remainingBalance, updatedAt: new Date() }).where(eq(schema.account.id, existing.accountId));
    await db.update(schema.mortgage).set({
      lender: m.lender || null,
      propertyId: m.propertyId || null,
      principal: m.principal,
      interestRatePct: m.interestRatePct,
      termMonths: m.termMonths,
      startDate: new Date(m.startDate),
      monthlyPayment: m.monthlyPayment,
      remainingBalance: m.remainingBalance,
      updatedAt: new Date(),
    }).where(eq(schema.mortgage.id, m.id));
  } else {
    const [acc] = await db.insert(schema.account).values({
      householdId: m.householdId,
      name: m.name,
      kind: "loan",
      institution: m.lender || null,
      currentValue: -m.remainingBalance,
      ownership: "shared",
      sharedSplitPct: 50,
    }).returning();
    await db.insert(schema.mortgage).values({
      accountId: acc.id,
      lender: m.lender || null,
      propertyId: m.propertyId || null,
      principal: m.principal,
      interestRatePct: m.interestRatePct,
      termMonths: m.termMonths,
      startDate: new Date(m.startDate),
      monthlyPayment: m.monthlyPayment,
      remainingBalance: m.remainingBalance,
    });
  }
  await recomputeSnapshot(m.householdId);
  revalidatePath("/real-estate");
  revalidatePath("/");
  revalidatePath("/accounts");
}

const fullPropertySchema = z.object({
  householdId: z.string(),
  property: z.object({
    name: z.string().min(1),
    address: z.string().optional().nullable(),
    signingDate: z.string(),
    purchasePrice: z.coerce.number().positive(),
    currentValue: z.coerce.number().positive(),
    annualAppreciationPct: z.coerce.number(),
    monthlyFees: z.coerce.number(),
    surfaceSqm: z.coerce.number().optional().nullable(),
  }),
  mortgage: z.object({
    enabled: z.boolean(),
    name: z.string().optional().nullable(),
    lender: z.string().optional().nullable(),
    principal: z.coerce.number().optional().nullable(),
    interestRatePct: z.coerce.number().optional().nullable(),
    termMonths: z.coerce.number().int().optional().nullable(),
    startDate: z.string().optional().nullable(),
    monthlyPayment: z.coerce.number().optional().nullable(),
    remainingBalance: z.coerce.number().optional().nullable(),
  }),
  charges: z.array(z.object({
    category: z.string(),
    label: z.string().min(1),
    amount: z.coerce.number().positive(),
    date: z.string(),
    includeInCostBasis: z.boolean(),
  })),
  amortizationRows: z.array(z.object({
    dueDate: z.string(),
    payment: z.coerce.number(),
    principal: z.coerce.number(),
    interest: z.coerce.number(),
    balance: z.coerce.number(),
  })).optional(),
});

export async function createFullProperty(values: z.infer<typeof fullPropertySchema>) {
  const p = fullPropertySchema.parse(values);
  const signingDate = new Date(p.property.signingDate);

  const [propertyAccount] = await db.insert(schema.account).values({
    householdId: p.householdId,
    name: p.property.name,
    kind: "real_estate",
    currentValue: p.property.currentValue,
    ownership: "shared",
    sharedSplitPct: 50,
  }).returning();

  const [propertyRow] = await db.insert(schema.property).values({
    accountId: propertyAccount.id,
    address: p.property.address || null,
    purchasePrice: p.property.purchasePrice,
    purchaseDate: signingDate,
    currentValue: p.property.currentValue,
    annualAppreciationPct: p.property.annualAppreciationPct,
    monthlyFees: p.property.monthlyFees,
    surfaceSqm: p.property.surfaceSqm || null,
  }).returning();

  let mortgageId: string | null = null;
  if (p.mortgage.enabled && p.mortgage.principal && p.mortgage.termMonths) {
    const [loanAccount] = await db.insert(schema.account).values({
      householdId: p.householdId,
      name: p.mortgage.name || `Prêt — ${p.property.name}`,
      kind: "loan",
      institution: p.mortgage.lender || null,
      currentValue: -(p.mortgage.remainingBalance ?? p.mortgage.principal),
      ownership: "shared",
      sharedSplitPct: 50,
    }).returning();

    const [mortgageRow] = await db.insert(schema.mortgage).values({
      accountId: loanAccount.id,
      propertyId: propertyRow.id,
      lender: p.mortgage.lender || null,
      principal: p.mortgage.principal,
      interestRatePct: p.mortgage.interestRatePct ?? 0,
      termMonths: p.mortgage.termMonths,
      startDate: p.mortgage.startDate ? new Date(p.mortgage.startDate) : signingDate,
      monthlyPayment: p.mortgage.monthlyPayment ?? 0,
      remainingBalance: p.mortgage.remainingBalance ?? p.mortgage.principal,
    }).returning();
    mortgageId = mortgageRow.id;

    if (p.amortizationRows && p.amortizationRows.length > 0) {
      await db.insert(schema.amortizationEntry).values(p.amortizationRows.map((r) => ({
        mortgageId: mortgageRow.id,
        dueDate: new Date(r.dueDate),
        payment: r.payment,
        principal: r.principal,
        interest: r.interest,
        balance: r.balance,
      })));
    }
  }

  if (p.charges.length > 0) {
    await db.insert(schema.oneOffCharge).values(p.charges.map((c) => ({
      householdId: p.householdId,
      date: new Date(c.date),
      label: c.label,
      category: c.category as never,
      amount: c.amount,
      propertyId: propertyRow.id,
      includeInCostBasis: c.includeInCostBasis,
    })));
  }

  await recomputeSnapshot(p.householdId);
  revalidatePath("/real-estate");
  revalidatePath("/charges");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { propertyId: propertyRow.id, accountId: propertyAccount.id, mortgageId };
}

export async function importAmortizationCSV(mortgageId: string, rows: Array<{ dueDate: string; payment: number; principal: number; interest: number; balance: number }>) {
  if (rows.length === 0) throw new Error("Aucune ligne à importer");
  await db.delete(schema.amortizationEntry).where(eq(schema.amortizationEntry.mortgageId, mortgageId));
  const values = rows.map((r) => ({
    mortgageId,
    dueDate: new Date(r.dueDate),
    payment: r.payment,
    principal: r.principal,
    interest: r.interest,
    balance: r.balance,
  }));
  await db.insert(schema.amortizationEntry).values(values);
  const last = rows[rows.length - 1];
  const first = rows[0];
  const [existing] = await db.select().from(schema.mortgage).where(eq(schema.mortgage.id, mortgageId));
  if (existing) {
    await db.update(schema.mortgage).set({
      remainingBalance: last.balance,
      monthlyPayment: first.payment,
      updatedAt: new Date(),
    }).where(eq(schema.mortgage.id, mortgageId));
    await db.update(schema.account).set({ currentValue: -last.balance, updatedAt: new Date() }).where(eq(schema.account.id, existing.accountId));
    const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, existing.accountId));
    if (acc) await recomputeSnapshot(acc.householdId);
  }
  revalidatePath("/real-estate");
  revalidatePath("/");
}

export async function generateAmortization(mortgageId: string) {
  const [m] = await db.select().from(schema.mortgage).where(eq(schema.mortgage.id, mortgageId));
  if (!m) throw new Error("Prêt introuvable");
  await db.delete(schema.amortizationEntry).where(eq(schema.amortizationEntry.mortgageId, mortgageId));
  const monthlyRate = m.interestRatePct / 100 / 12;
  const payment = m.monthlyPayment;
  let balance = m.principal;
  const start = m.startDate as unknown as Date;
  const entries = [];
  for (let i = 0; i < m.termMonths && balance > 0.5; i++) {
    const interest = balance * monthlyRate;
    const principal = Math.min(payment - interest, balance);
    balance = Math.max(0, balance - principal);
    const due = new Date(start.getFullYear(), start.getMonth() + i + 1, 1);
    entries.push({ mortgageId, dueDate: due, payment, principal, interest, balance });
  }
  if (entries.length > 0) await db.insert(schema.amortizationEntry).values(entries);
  revalidatePath("/real-estate");
}
