"use client";

import { use, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { Coins } from "lucide-react";

export function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from } = use(searchParams);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  function handleGoogle() {
    start(async () => {
      await signIn.social({
        provider: "google",
        callbackURL: from || "/",
      });
    });
  }

  function handleEmail() {
    if (!email || !password) {
      toast.error("Email et mot de passe requis");
      return;
    }
    start(async () => {
      const res = await signIn.email({
        email,
        password,
        callbackURL: from || "/",
      });
      if (res.error) {
        toast.error(res.error.message ?? "Identifiants invalides");
      } else {
        router.push(from || "/");
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
          <h1 className="text-xl font-semibold">Wallet</h1>
          <p className="text-xs text-muted-foreground">Suivi de patrimoine privé</p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={pending}
        >
          <GoogleIcon /> Continuer avec Google
        </Button>

        <div className="my-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          ou
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@example.com"
              autoComplete="email"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Mot de passe</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEmail();
              }}
            />
          </div>
          <Button onClick={handleEmail} disabled={pending}>
            {pending ? "…" : "Se connecter"}
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="text-foreground hover:underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
