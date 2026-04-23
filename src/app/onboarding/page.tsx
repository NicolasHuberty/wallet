import { getPrimaryHousehold, getAccounts } from "@/lib/queries";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage() {
  const h = await getPrimaryHousehold();
  const existing = await getAccounts(h.id);
  // Already onboarded? send to dashboard.
  if (existing.length > 0) redirect("/dashboard");
  return <OnboardingWizard householdName={h.name} />;
}
