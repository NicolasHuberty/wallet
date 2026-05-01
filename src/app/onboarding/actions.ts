"use server";

import { db, schema } from "@/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { accountKind } from "@/db/schema";
import { recomputeSnapshot } from "@/lib/snapshots";
import { assertWritable } from "@/lib/demo";
import { getPrimaryHousehold } from "@/lib/queries";

const onboardingSchema = z.object({
  accounts: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: z.enum(accountKind),
        institution: z.string().optional().nullable(),
        currentValue: z.coerce.number(),
        annualYieldPct: z.coerce.number().optional().nullable(),
        monthlyContribution: z.coerce.number().optional().nullable(),
      })
    )
    .min(1),
  incomes: z
    .array(
      z.object({
        label: z.string().min(1),
        amount: z.coerce.number().positive(),
      })
    )
    .optional()
    .default([]),
});

export type OnboardingResult = {
  householdId: string;
  realEstateAccounts: { id: string; name: string; currentValue: number }[];
};

export async function completeOnboarding(
  values: z.infer<typeof onboardingSchema>,
): Promise<OnboardingResult> {
  assertWritable();
  const p = onboardingSchema.parse(values);
  const h = await getPrimaryHousehold();

  const realEstateAccounts: OnboardingResult["realEstateAccounts"] = [];

  for (const a of p.accounts) {
    const [row] = await db
      .insert(schema.account)
      .values({
        householdId: h.id,
        name: a.name,
        kind: a.kind,
        institution: a.institution || null,
        currency: "EUR",
        currentValue: a.currentValue,
        ownership: "shared",
        sharedSplitPct: 100,
        annualYieldPct: a.annualYieldPct ?? null,
        monthlyContribution: a.monthlyContribution ?? null,
      })
      .returning();
    if (a.kind === "real_estate") {
      realEstateAccounts.push({ id: row.id, name: row.name, currentValue: row.currentValue });
    }
  }

  for (const i of p.incomes) {
    await db.insert(schema.recurringIncome).values({
      householdId: h.id,
      label: i.label,
      category: "salary",
      amount: i.amount,
      ownership: "shared",
      startDate: new Date(),
    });
  }

  // Default projection scenario
  await db.insert(schema.projectionScenario).values({
    householdId: h.id,
    name: "Base",
    inflationPct: 2,
    stockReturnPct: 7,
    cashReturnPct: 2.5,
    propertyAppreciationPct: 2,
    horizonYears: 30,
    isDefault: true,
  });

  await recomputeSnapshot(h.id);
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");

  return { householdId: h.id, realEstateAccounts };
}
