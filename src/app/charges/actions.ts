"use server";

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { chargeCategory } from "@/db/schema";

const chargeSchema = z.object({
  id: z.string().optional(),
  householdId: z.string(),
  date: z.string(),
  label: z.string().min(1),
  category: z.enum(chargeCategory),
  amount: z.coerce.number().positive(),
  accountId: z.string().optional().nullable(),
  propertyId: z.string().optional().nullable(),
  includeInCostBasis: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

export async function saveCharge(values: z.infer<typeof chargeSchema>) {
  const p = chargeSchema.parse(values);
  const data = {
    householdId: p.householdId,
    date: new Date(p.date),
    label: p.label,
    category: p.category,
    amount: p.amount,
    accountId: p.accountId || null,
    propertyId: p.propertyId || null,
    includeInCostBasis: p.includeInCostBasis,
    notes: p.notes || null,
    updatedAt: new Date(),
  };
  if (p.id) {
    await db.update(schema.oneOffCharge).set(data).where(eq(schema.oneOffCharge.id, p.id));
  } else {
    await db.insert(schema.oneOffCharge).values(data);
  }
  revalidatePath("/charges");
  revalidatePath("/real-estate");
  revalidatePath("/");
}

export async function deleteCharge(id: string) {
  await db.delete(schema.oneOffCharge).where(eq(schema.oneOffCharge.id, id));
  revalidatePath("/charges");
  revalidatePath("/real-estate");
  revalidatePath("/");
}
