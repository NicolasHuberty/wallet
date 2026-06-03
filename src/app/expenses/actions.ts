"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/demo";
import { flowFrequency, flowType } from "@/db/schema";

const dayOfMonth = z.coerce.number().int().min(1).max(31).nullable().optional();

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
  // Champs cash-flow ("Cap")
  dayOfMonth,
  frequency: z.enum(flowFrequency).optional().default("monthly"),
  flowType: z.enum(flowType).optional().default("fixed"),
  active: z.boolean().optional().default(true),
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
    dayOfMonth: p.dayOfMonth ?? null,
    frequency: p.frequency,
    flowType: p.flowType,
    active: p.active,
    updatedAt: new Date(),
  };
  if (p.id) {
    await db.update(schema.recurringExpense).set(data).where(eq(schema.recurringExpense.id, p.id));
  } else {
    await db.insert(schema.recurringExpense).values(data);
  }
  revalidatePath("/expenses");
  revalidatePath("/cashflow");
  revalidatePath("/");
}

export async function deleteRecurringExpense(id: string) {
  assertWritable();
  await db.delete(schema.recurringExpense).where(eq(schema.recurringExpense.id, id));
  revalidatePath("/expenses");
  revalidatePath("/cashflow");
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
  // Champs cash-flow ("Cap")
  dayOfMonth,
  isVariable: z.boolean().optional().default(false),
  floorAmount: z.coerce.number().min(0).nullable().optional(),
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
    dayOfMonth: p.dayOfMonth ?? null,
    isVariable: p.isVariable,
    floorAmount: p.isVariable ? p.floorAmount ?? null : null,
    updatedAt: new Date(),
  };
  if (p.id) {
    await db.update(schema.recurringIncome).set(data).where(eq(schema.recurringIncome.id, p.id));
  } else {
    await db.insert(schema.recurringIncome).values(data);
  }
  revalidatePath("/expenses");
  revalidatePath("/cashflow");
  revalidatePath("/");
}

export async function deleteRecurringIncome(id: string) {
  assertWritable();
  await db.delete(schema.recurringIncome).where(eq(schema.recurringIncome.id, id));
  revalidatePath("/expenses");
  revalidatePath("/");
}
