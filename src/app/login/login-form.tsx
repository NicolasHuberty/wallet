"use client";

import { use, useState, useTransition } from "react";
import Link from "next/link";
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
        toast.error((e as Error).message ?? "Connexion Google impossible");
      }
    });
  }

  function handleEmail() {
    if (!email || !password) {
      toast.error("Email et mot de passe requis");
      return;
    }
    start(async () => {
      try {
        const res = await signIn.email({ email, password });
        if (res?.error) {
          toast.error(res.error.message ?? "Identifiants invalides");
          return;
        }
        toast.success("Connecté");
        // Full navigation: ensures the new session cookie is sent on the
        // next request (router.push keeps the same browsing session and
        // can race with the Set-Cookie from better-auth).
        window.location.href = from || "/dashboard";
      } catch (e) {
        toast.error((e as Error).message ?? "Connexion impossible");
      }
    });
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Hero / branding — generous on mobile, centered on desktop */}
      <div className="flex flex-1 items-start justify-center px-4 pt-12 pb-6 sm:items-center sm:p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Coins className="size-6" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Bon retour</h1>
            <p className="text-sm text-muted-foreground">
              Connecte-toi pour retrouver ton patrimoine.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            {/* Google button — visually distinct (outline + icon + larger) */}
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-center gap-3 text-[15px] font-medium"
              onClick={handleGoogle}
              disabled={pending}
            >
              <GoogleIcon /> Continuer avec Google
            </Button>

            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              ou avec email
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@example.com"
                  autoComplete="email"
                  className="h-12 text-base md:text-base"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Mot de passe
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-12 text-base md:text-base"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEmail();
                  }}
                />
              </div>
              <Button
                onClick={handleEmail}
                disabled={pending}
                className="h-12 w-full text-[15px] font-semibold"
              >
                {pending ? "…" : "Se connecter"}
              </Button>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
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
