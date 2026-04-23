"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeSnapshot } from "@/lib/snapshots";
import { assertWritable } from "@/lib/demo";

function touchCheckIn() {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/snapshots");
  revalidatePath("/check-in");
  revalidatePath("/expenses");
  revalidatePath("/charges");
}

const noteSchema = z.object({
  id: z.string().min(1),
  note: z.string().optional().nullable(),
});

export async function updateExpenseNote(values: z.infer<typeof noteSchema>) {
  assertWritable();
  const p = noteSchema.parse(values);
  await db
    .update(schema.recurringExpense)
    .set({ notes: p.note || null, updatedAt: new Date() })
    .where(eq(schema.recurringExpense.id, p.id));
  touchCheckIn();
}

export async function updateIncomeNote(values: z.infer<typeof noteSchema>) {
  assertWritable();
  const p = noteSchema.parse(values);
  await db
    .update(schema.recurringIncome)
    .set({ notes: p.note || null, updatedAt: new Date() })
    .where(eq(schema.recurringIncome.id, p.id));
  touchCheckIn();
}

export async function updateChargeNote(values: z.infer<typeof noteSchema>) {
  assertWritable();
  const p = noteSchema.parse(values);
  await db
    .update(schema.oneOffCharge)
    .set({ notes: p.note || null, updatedAt: new Date() })
    .where(eq(schema.oneOffCharge.id, p.id));
  touchCheckIn();
}

const dcaSchema = z.object({
  accountId: z.string().min(1),
  monthlyContribution: z.coerce.number().nullable(),
});

export async function updateAccountDCA(values: z.infer<typeof dcaSchema>) {
  assertWritable();
  const p = dcaSchema.parse(values);
  await db
    .update(schema.account)
    .set({
      monthlyContribution: p.monthlyContribution,
      updatedAt: new Date(),
    })
    .where(eq(schema.account.id, p.accountId));
  touchCheckIn();
}

// ---------- Quick-add : recurring expense ----------
const quickExpenseSchema = z.object({
  householdId: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(schema.expenseCategory),
  amount: z.coerce.number().positive(),
  notes: z.string().optional().nullable(),
});

export async function quickAddExpense(values: z.infer<typeof quickExpenseSchema>) {
  assertWritable();
  const p = quickExpenseSchema.parse(values);
  await db.insert(schema.recurringExpense).values({
    householdId: p.householdId,
    label: p.label,
    category: p.category,
    amount: p.amount,
    ownership: "shared",
    startDate: new Date(),
    notes: p.notes || null,
    updatedAt: new Date(),
  });
  touchCheckIn();
}

// ---------- Quick-add : one-off charge ----------
const quickChargeSchema = z.object({
  householdId: z.string().min(1),
  date: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(schema.chargeCategory),
  amount: z.coerce.number().positive(),
  notes: z.string().optional().nullable(),
  saveAsTemplate: z.boolean().default(true),
  templateId: z.string().optional().nullable(),
});

export async function quickAddCharge(values: z.infer<typeof quickChargeSchema>) {
  assertWritable();
  const p = quickChargeSchema.parse(values);
  await db.insert(schema.oneOffCharge).values({
    householdId: p.householdId,
    date: new Date(p.date),
    label: p.label,
    category: p.category,
    amount: p.amount,
    accountId: null,
    propertyId: null,
    includeInCostBasis: false,
    notes: p.notes || null,
    updatedAt: new Date(),
  });

  // Upsert template for reuse
  if (p.saveAsTemplate) {
    if (p.templateId) {
      await db
        .update(schema.chargeTemplate)
        .set({
          label: p.label,
          category: p.category,
          defaultAmount: p.amount,
          notes: p.notes || null,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.chargeTemplate.id, p.templateId));
    } else {
      // Dedupe by same label + category for the household
      const existing = await db
        .select()
        .from(schema.chargeTemplate)
        .where(eq(schema.chargeTemplate.householdId, p.householdId));
      const dup = existing.find(
        (t) =>
          t.label.trim().toLowerCase() === p.label.trim().toLowerCase() &&
          t.category === p.category
      );
      if (dup) {
        await db
          .update(schema.chargeTemplate)
          .set({
            defaultAmount: p.amount,
            notes: p.notes || null,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.chargeTemplate.id, dup.id));
      } else {
        await db.insert(schema.chargeTemplate).values({
          householdId: p.householdId,
          label: p.label,
          category: p.category,
          defaultAmount: p.amount,
          notes: p.notes || null,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  touchCheckIn();
}

export async function deleteChargeTemplate(id: string) {
  assertWritable();
  await db.delete(schema.chargeTemplate).where(eq(schema.chargeTemplate.id, id));
  touchCheckIn();
}

// ---------- Quick-add : one-off income ----------
const quickIncomeSchema = z.object({
  householdId: z.string().min(1),
  date: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(schema.oneOffIncomeCategory),
  amount: z.coerce.number().positive(),
  notes: z.string().optional().nullable(),
  saveAsTemplate: z.boolean().default(true),
  templateId: z.string().optional().nullable(),
});

export async function quickAddIncome(values: z.infer<typeof quickIncomeSchema>) {
  assertWritable();
  const p = quickIncomeSchema.parse(values);
  await db.insert(schema.oneOffIncome).values({
    householdId: p.householdId,
    date: new Date(p.date),
    label: p.label,
    category: p.category,
    amount: p.amount,
    notes: p.notes || null,
    updatedAt: new Date(),
  });

  if (p.saveAsTemplate) {
    if (p.templateId) {
      await db
        .update(schema.incomeTemplate)
        .set({
          label: p.label,
          category: p.category,
          defaultAmount: p.amount,
          notes: p.notes || null,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.incomeTemplate.id, p.templateId));
    } else {
      const existing = await db
        .select()
        .from(schema.incomeTemplate)
        .where(eq(schema.incomeTemplate.householdId, p.householdId));
      const dup = existing.find(
        (t) =>
          t.label.trim().toLowerCase() === p.label.trim().toLowerCase() &&
          t.category === p.category
      );
      if (dup) {
        await db
          .update(schema.incomeTemplate)
          .set({
            defaultAmount: p.amount,
            notes: p.notes || null,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.incomeTemplate.id, dup.id));
      } else {
        await db.insert(schema.incomeTemplate).values({
          householdId: p.householdId,
          label: p.label,
          category: p.category,
          defaultAmount: p.amount,
          notes: p.notes || null,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  touchCheckIn();
}

export async function updateOneOffIncomeNote(values: z.infer<typeof noteSchema>) {
  assertWritable();
  const p = noteSchema.parse(values);
  await db
    .update(schema.oneOffIncome)
    .set({ notes: p.note || null, updatedAt: new Date() })
    .where(eq(schema.oneOffIncome.id, p.id));
  touchCheckIn();
}

export async function removeOneOffIncome(id: string) {
  assertWritable();
  await db.delete(schema.oneOffIncome).where(eq(schema.oneOffIncome.id, id));
  touchCheckIn();
}

export async function deleteIncomeTemplate(id: string) {
  assertWritable();
  await db.delete(schema.incomeTemplate).where(eq(schema.incomeTemplate.id, id));
  touchCheckIn();
}

// ---------- Suppression ----------
export async function removeExpense(id: string) {
  assertWritable();
  await db.delete(schema.recurringExpense).where(eq(schema.recurringExpense.id, id));
  touchCheckIn();
}

export async function removeCharge(id: string) {
  assertWritable();
  await db.delete(schema.oneOffCharge).where(eq(schema.oneOffCharge.id, id));
  touchCheckIn();
}

const checkInSchema = z.object({
  householdId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format YYYY-MM attendu"),
  rows: z.array(
    z.object({
      accountId: z.string().min(1),
      newValue: z.coerce.number(),
    })
  ),
  mortgageRows: z
    .array(
      z.object({
        mortgageId: z.string().min(1),
        remainingBalance: z.coerce.number(),
      })
    )
    .default([]),
  expenseActuals: z
    .array(
      z.object({
        expenseId: z.string().min(1),
        amount: z.coerce.number(),
      })
    )
    .default([]),
  note: z.string().optional().nullable(),
});

export async function saveMonthlyCheckIn(values: z.infer<typeof checkInSchema>) {
  assertWritable();
  const p = checkInSchema.parse(values);
  // Snapshot date = last day of the selected month at 23:59:59
  const [y, m] = p.month.split("-").map(Number);
  const when = new Date(y, m, 0, 23, 59, 59, 999);

  for (const r of p.rows) {
    await db
      .update(schema.account)
      .set({ currentValue: r.newValue, updatedAt: new Date() })
      .where(eq(schema.account.id, r.accountId));
  }

  // Update mortgages AND sync their linked loan account currentValue to -remainingBalance.
  for (const m of p.mortgageRows) {
    await db
      .update(schema.mortgage)
      .set({ remainingBalance: m.remainingBalance, updatedAt: new Date() })
      .where(eq(schema.mortgage.id, m.mortgageId));

    const [mortgageRow] = await db
      .select()
      .from(schema.mortgage)
      .where(eq(schema.mortgage.id, m.mortgageId));
    if (mortgageRow) {
      await db
        .update(schema.account)
        .set({ currentValue: -Math.abs(m.remainingBalance), updatedAt: new Date() })
        .where(eq(schema.account.id, mortgageRow.accountId));
    }
  }

  await recomputeSnapshot(p.householdId, when);

  // Per-account snapshot (historical tracking)
  const accountsNow = await db
    .select()
    .from(schema.account)
    .where(eq(schema.account.householdId, p.householdId));
  for (const acc of accountsNow) {
    await db.insert(schema.accountSnapshot).values({
      accountId: acc.id,
      date: when,
      value: acc.currentValue,
      updatedAt: new Date(),
    });
  }

  // Per-expense actual for the check-in month (upsert by expense_id + month)
  const monthKey = p.month;
  for (const a of p.expenseActuals) {
    const existing = await db
      .select()
      .from(schema.recurringExpenseActual)
      .where(eq(schema.recurringExpenseActual.expenseId, a.expenseId));
    const sameMonth = existing.find((r) => r.month === monthKey);
    if (sameMonth) {
      await db
        .update(schema.recurringExpenseActual)
        .set({ amount: a.amount, updatedAt: new Date() })
        .where(eq(schema.recurringExpenseActual.id, sameMonth.id));
    } else {
      await db.insert(schema.recurringExpenseActual).values({
        expenseId: a.expenseId,
        month: monthKey,
        amount: a.amount,
        notes: null,
        updatedAt: new Date(),
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/snapshots");
  revalidatePath("/check-in");
}
