import { getPrimaryHousehold } from "@/lib/queries";
import { CapOnboarding } from "./cap-onboarding";

export const dynamic = "force-dynamic";

export default async function CapOnboardingPage() {
  // Garantit qu'un household existe (création paresseuse côté query).
  await getPrimaryHousehold();
  return <CapOnboarding />;
}
