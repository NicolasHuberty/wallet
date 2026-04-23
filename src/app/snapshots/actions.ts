"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upsertManualSnapshot, deleteSnapshot } from "@/lib/snapshots";
import { assertWritable } from "@/lib/demo";

const schema = z.object({
  householdId: z.string(),
  date: z.string(),
  totalAssets: z.coerce.number(),
  totalLiabilities: z.coerce.number(),
});

export async function saveManualSnapshot(values: z.infer<typeof schema>) {
  assertWritable();
  const p = schema.parse(values);
  await upsertManualSnapshot(p.householdId, new Date(p.date), p.totalAssets, p.totalLiabilities);
  revalidatePath("/snapshots");
  revalidatePath("/");
}

export async function removeSnapshot(id: string) {
  assertWritable();
  await deleteSnapshot(id);
  revalidatePath("/snapshots");
  revalidatePath("/");
}
