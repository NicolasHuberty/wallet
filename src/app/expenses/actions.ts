"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/demo";

const expenseSchema = z.object({
  id: z.string().optional(),
  householdId: z.string(),
  label: z.string().min(1),
  category: z.string().min(1),
  amount: z.coerce.number(),
  ownership: z.enum(["shared", "member"]),
  ownerMemberId: z.string().optional().nullable(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
});

export async function saveRecurringExpense(values: z.infer<typeof expenseSchema>) {
  assertWritable();
  const p = expenseSchema.parse(values);
  const data = {
    householdId: p.householdId,
    label: p.label,
    category: p.category,
    amount: p.amount,
    ownership: p.ownership,
    ownerMemberId: p.ownership === "member" ? p.ownerMemberId || null : null,
    startDate: new Date(p.startDate),
    endDate: p.endDate ? new Date(p.endDate) : null,
    updatedAt: new Date(),
  };
  if (p.id) {
    await db.update(schema.recurringExpense).set(data).where(eq(schema.recurringExpense.id, p.id));
  } else {
    await db.insert(schema.recurringExpense).values(data);
  }
  revalidatePath("/expenses");
  revalidatePath("/");
}

export async function deleteRecurringExpense(id: string) {
  assertWritable();
  await db.delete(schema.recurringExpense).where(eq(schema.recurringExpense.id, id));
  revalidatePath("/expenses");
  revalidatePath("/");
}

const incomeSchema = z.object({
  id: z.string().optional(),
  householdId: z.string(),
  label: z.string().min(1),
  category: z.string().min(1),
  amount: z.coerce.number(),
  ownership: z.enum(["shared", "member"]),
  ownerMemberId: z.string().optional().nullable(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
});

export async function saveRecurringIncome(values: z.infer<typeof incomeSchema>) {
  assertWritable();
  const p = incomeSchema.parse(values);
  const data = {
    householdId: p.householdId,
    label: p.label,
    category: p.category,
    amount: p.amount,
    ownership: p.ownership,
    ownerMemberId: p.ownership === "member" ? p.ownerMemberId || null : null,
    startDate: new Date(p.startDate),
    endDate: p.endDate ? new Date(p.endDate) : null,
    updatedAt: new Date(),
  };
  if (p.id) {
    await db.update(schema.recurringIncome).set(data).where(eq(schema.recurringIncome.id, p.id));
  } else {
    await db.insert(schema.recurringIncome).values(data);
  }
  revalidatePath("/expenses");
  revalidatePath("/");
}

export async function deleteRecurringIncome(id: string) {
  assertWritable();
  await db.delete(schema.recurringIncome).where(eq(schema.recurringIncome.id, id));
  revalidatePath("/expenses");
  revalidatePath("/");
}
