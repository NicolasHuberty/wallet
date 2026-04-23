"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const householdSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  baseCurrency: z.string().min(3).max(3),
});

export async function saveHousehold(values: z.infer<typeof householdSchema>) {
  const p = householdSchema.parse(values);
  await db.update(schema.household).set({ name: p.name, baseCurrency: p.baseCurrency.toUpperCase(), updatedAt: new Date() }).where(eq(schema.household.id, p.id));
  revalidatePath("/", "layout");
}

const memberSchema = z.object({
  id: z.string().optional(),
  householdId: z.string(),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  color: z.string().default("#6366f1"),
});

export async function saveMember(values: z.infer<typeof memberSchema>) {
  const p = memberSchema.parse(values);
  const data = { householdId: p.householdId, name: p.name, email: p.email || null, color: p.color, updatedAt: new Date() };
  if (p.id) await db.update(schema.member).set(data).where(eq(schema.member.id, p.id));
  else await db.insert(schema.member).values(data);
  revalidatePath("/", "layout");
}

export async function deleteMember(id: string) {
  await db.delete(schema.member).where(eq(schema.member.id, id));
  revalidatePath("/", "layout");
}
