import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/demo";
import { Landing } from "./landing";

export default async function RootPage() {
  if (DEMO_MODE) redirect("/dashboard");
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/dashboard");
  return <Landing />;
}
