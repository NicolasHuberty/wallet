import { SignupForm } from "./signup-form";

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  return <SignupForm searchParams={searchParams} />;
}
