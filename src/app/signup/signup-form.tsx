"use client";

import { use, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { signIn, signUp } from "@/lib/auth-client";
import { Coins } from "lucide-react";

export function SignupForm({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = use(searchParams);
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  function handleGoogle() {
    start(async () => {
      try {
        await signIn.social({
          provider: "google",
          callbackURL: from || "/dashboard",
        });
      } catch (e) {
        toast.error((e as Error).message ?? "Google indisponible");
      }
    });
  }

  function handleEmail() {
    if (!name || !email || !password) {
      toast.error("Nom, email et mot de passe requis");
      return;
    }
    if (password.length < 8) {
      toast.error("Mot de passe : 8 caractères minimum");
      return;
    }
    start(async () => {
      try {
        const res = await signUp.email({ email, password, name });
        if (res?.error) {
          toast.error(res.error.message ?? "Inscription impossible");
          return;
        }
        toast.success("Compte créé");
        // Full navigation so the session cookie is included on the next request.
        window.location.href = from || "/onboarding";
      } catch (e) {
        toast.error((e as Error).message ?? "Inscription impossible");
      }
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coins className="size-5" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-semibold">Créer un compte Wallet</h1>
          <p className="text-xs text-muted-foreground">
            Suivi de patrimoine privé, données chiffrées au repos
          </p>
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={pending}>
          S'inscrire avec Google
        </Button>

        <div className="my-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          ou
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nicolas" autoComplete="name" />
          </div>
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="grid gap-1.5">
            <Label>Mot de passe</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && handleEmail()}
            />
          </div>
          <Button onClick={handleEmail} disabled={pending}>
            {pending ? "…" : "Créer mon compte"}
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-foreground hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
