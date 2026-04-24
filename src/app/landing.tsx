import Link from "next/link";
import { ArrowUpRight, Star, Sparkles, Eye } from "lucide-react";

export function Landing() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <style>{`
        .landing-root {
          --cream: #F5EFE3;
          --cream-deep: #EDE5D2;
          --ink: #15120D;
          --ink-soft: #3A352A;
          --moss: #2B4A3B;
          --moss-deep: #17301F;
          --rust: #C75C2C;
          --stone: #8B7E66;
          --hairline: rgba(21, 18, 13, 0.15);

          background: var(--cream);
          color: var(--ink);
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          background-image:
            radial-gradient(circle at 20% 10%, rgba(199, 92, 44, 0.05) 0%, transparent 35%),
            radial-gradient(circle at 85% 80%, rgba(43, 74, 59, 0.06) 0%, transparent 40%);
        }

        /* Subtle paper grain */
        .landing-root::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0.5;
          mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' /%3E%3CfeColorMatrix values='0 0 0 0 0.08 0 0 0 0 0.07 0 0 0 0 0.05 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        .landing-root > * { position: relative; z-index: 1; }

        .serif { font-family: var(--font-serif), "Fraunces", Georgia, serif; font-optical-sizing: auto; font-variation-settings: "SOFT" 80, "opsz" 144; }
        .serif-display {
          font-family: var(--font-serif), "Fraunces", Georgia, serif;
          font-optical-sizing: auto;
          font-variation-settings: "SOFT" 100, "opsz" 144, "WONK" 0;
          font-weight: 430;
          line-height: 0.92;
          letter-spacing: -0.035em;
        }
        .serif-italic {
          font-family: var(--font-serif), "Fraunces", Georgia, serif;
          font-style: italic;
          font-variation-settings: "SOFT" 100, "opsz" 144, "WONK" 1;
        }
        .mono { font-family: var(--font-geist-mono), ui-monospace, monospace; font-feature-settings: "tnum", "zero"; }

        .rule { border-top: 1px solid var(--hairline); }
        .rule-heavy { border-top: 2px solid var(--ink); }

        .fade-in { opacity: 0; animation: fade-rise 900ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards; }
        @keyframes fade-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .d1 { animation-delay: 60ms; }
        .d2 { animation-delay: 180ms; }
        .d3 { animation-delay: 320ms; }
        .d4 { animation-delay: 480ms; }
        .d5 { animation-delay: 640ms; }
        .d6 { animation-delay: 820ms; }

        .btn-primary {
          background: var(--ink);
          color: var(--cream);
          padding: 0.9rem 1.5rem;
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          transition: all 180ms ease;
          position: relative;
          border: 1px solid var(--ink);
        }
        .btn-primary:hover {
          background: var(--moss-deep);
          border-color: var(--moss-deep);
          transform: translate(2px, -2px);
          box-shadow: -4px 4px 0 var(--rust);
        }
        .btn-ghost {
          background: transparent;
          color: var(--ink);
          padding: 0.9rem 1.5rem;
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          border: 1px solid var(--hairline);
          transition: all 180ms ease;
        }
        .btn-ghost:hover {
          border-color: var(--ink);
          background: var(--cream-deep);
        }

        .ledger-card {
          border: 1px solid var(--hairline);
          background: var(--cream-deep);
          position: relative;
        }
        .ledger-card::before {
          content: '';
          position: absolute;
          left: 0; right: 0; top: 0;
          height: 1px;
          background: linear-gradient(to right, transparent, var(--moss) 30%, var(--moss) 70%, transparent);
          opacity: 0.3;
        }

        .row-num {
          font-feature-settings: "tnum", "zero";
          letter-spacing: -0.02em;
        }

        /* Marquee-like ticker */
        .ticker-track {
          display: flex;
          gap: 3rem;
          animation: ticker 38s linear infinite;
          white-space: nowrap;
        }
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>

      {/* ──────────────────── Top bar ──────────────────── */}
      <header className="fade-in d1 flex items-center justify-between px-5 py-4 md:px-12 md:py-5">
        <div className="flex items-center gap-3">
          <div
            className="flex size-8 items-center justify-center rounded-[3px]"
            style={{ background: "var(--ink)", color: "var(--cream)" }}
          >
            <span className="mono text-[15px] font-semibold">W</span>
          </div>
          <span className="mono hidden text-[11px] uppercase tracking-[0.28em] text-[var(--ink-soft)] sm:inline">
            Wallet · ledger
          </span>
          <span className="serif text-[17px] sm:hidden">Wallet</span>
        </div>
        <nav className="flex items-center gap-4 text-sm sm:gap-6">
          <a
            href="https://github.com/NicolasHuberty/wallet"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] md:inline-flex"
          >
<GithubGlyph /> Source
          </a>
          <Link
            href="/login"
            className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
          >
            Log in
          </Link>
          <Link href="/signup" className="serif-italic hidden text-[15px] text-[var(--rust)] underline underline-offset-4 hover:text-[var(--moss-deep)] sm:inline-block">
            Créer un compte →
          </Link>
        </nav>
      </header>

      {/* ──────────────────── Hero ──────────────────── */}
      <section className="relative px-5 pb-20 pt-8 md:px-12 md:pb-40 md:pt-24">
        <div className="mx-auto max-w-6xl">
          {/* Eyebrow */}
          <div className="fade-in d2 mb-6 flex items-center gap-3 md:mb-10">
            <span className="block h-px w-8 md:w-10" style={{ background: "var(--ink)" }} />
            <span className="mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-soft)] md:text-[10px] md:tracking-[0.35em]">
              Open source · self-hosted · MIT
            </span>
          </div>

          <h1 className="fade-in d3 serif-display max-w-[18ch] text-[clamp(3rem,13vw,11rem)]">
            Personal finance,
            <br />
            <span className="serif-italic" style={{ color: "var(--moss-deep)" }}>
              on your own
            </span>{" "}
            <span className="underline decoration-[var(--rust)] decoration-[5px] underline-offset-[0.1em] md:decoration-[6px]">
              books
            </span>
            .
          </h1>

          <div className="mt-8 grid gap-8 md:mt-12 md:grid-cols-12 md:gap-10">
            <p className="fade-in d4 text-[15px] leading-[1.55] text-[var(--ink-soft)] md:col-span-6 md:text-[17px]">
              <span className="font-medium text-[var(--ink)]">Wallet</span> est un suivi de
              patrimoine <span className="serif-italic">self-hosted</span> : accounts, épargne,
              DCA, crédits, immobilier. Un seul formulaire mensuel, une base Postgres sous votre
              contrôle, et des graphes qui racontent ce qui se passe vraiment. <br className="hidden md:inline" />
              <span className="md:block md:mt-4"> Pas de cloud tiers, pas d&apos;analytics, pas de <span className="serif-italic">« freemium »</span>.</span>
            </p>

            <div className="fade-in d5 md:col-span-6 md:border-l md:border-[var(--hairline)] md:pl-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  href="/signup"
                  className="btn-primary w-full justify-center text-[15px] sm:w-auto sm:justify-start"
                >
                  Créer mon compte <ArrowUpRight className="size-4" />
                </Link>
                <a
                  href="https://demo.wallet.huberty.pro"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost w-full justify-center text-[14px] sm:w-auto sm:justify-start"
                >
                  <Eye className="size-4" /> Try the demo
                </a>
                <a
                  href="https://github.com/NicolasHuberty/wallet"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)] underline underline-offset-4 sm:justify-start"
                >
                  <Star className="size-3.5" /> Star on GitHub
                </a>
              </div>
              <div className="mono mt-6 inline-flex max-w-full items-center gap-2 overflow-hidden rounded-[2px] border border-[var(--hairline)] bg-[var(--cream-deep)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">
                <span className="shrink-0 text-[var(--moss-deep)]">$</span>{" "}
                <span className="truncate">git clone github.com/NicolasHuberty/wallet</span>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative side label */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-8 top-32 hidden rotate-90 origin-top-right mono text-[10px] uppercase tracking-[0.4em] md:block"
          style={{ color: "var(--stone)" }}
        >
          FOLIO № 01 · 2026
        </div>
      </section>

      {/* ──────────────────── Ticker/stat bar ──────────────────── */}
      <div
        className="rule-heavy rule fade-in d6 overflow-hidden border-y py-4 md:py-6"
        style={{ borderColor: "var(--ink)", background: "var(--cream-deep)" }}
      >
        <div className="ticker-track mono text-[13px] uppercase tracking-[0.2em]">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-12 pr-12">
              <Item label="Next.js" value="16.2" />
              <Dot />
              <Item label="Postgres" value="16" />
              <Dot />
              <Item label="Drizzle" value="0.45" />
              <Dot />
              <Item label="better-auth" value="1.6" />
              <Dot />
              <Item label="Tailwind" value="v4" />
              <Dot />
              <Item label="Recharts" value="3" />
              <Dot />
              <Item label="0" value="third-party trackers" reverse />
              <Dot />
              <Item label="1" value="monthly check-in" reverse />
              <Dot />
              <Item label="∞" value="projection horizon" reverse />
              <Dot />
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────────── Features — ledger style ──────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-12 md:py-32">
        <div className="mb-10 flex items-baseline justify-between md:mb-14">
          <h2 className="serif-display text-[clamp(2rem,5vw,3.75rem)]">
            <span style={{ color: "var(--stone)" }}>§ </span>
            Trois entrées,
            <br />
            <span className="serif-italic" style={{ color: "var(--moss-deep)" }}>
              zéro friction.
            </span>
          </h2>
          <span className="mono hidden text-[10px] uppercase tracking-[0.35em] text-[var(--stone)] md:block">
            Chapter i · features
          </span>
        </div>

        <div className="grid gap-px border border-[var(--hairline)] md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <article
              key={f.title}
              className="ledger-card group p-6 transition-colors sm:p-8 md:p-10"
              style={{ background: "var(--cream-deep)" }}
            >
              <div className="mono mb-6 flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-[var(--stone)] md:mb-8">
                <span>Entry</span>
                <span className="row-num">{String(i + 1).padStart(2, "0")} / 03</span>
              </div>
              <h3 className="serif text-[clamp(1.375rem,3vw,2rem)] font-medium leading-[1.05]">
                {f.title}
              </h3>
              <p className="mt-4 text-[14px] leading-[1.6] text-[var(--ink-soft)]">{f.body}</p>
              <div className="mt-6 flex flex-wrap gap-2 md:mt-8">
                {f.tags.map((t) => (
                  <span
                    key={t}
                    className="mono border border-[var(--hairline)] px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-[var(--ink-soft)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ──────────────────── Preview / ledger mock ──────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-20 md:px-12 md:pb-40">
        <div className="mb-8 flex items-baseline justify-between md:mb-10">
          <h2 className="serif-display text-[clamp(2rem,5vw,3.5rem)]">
            Une <span className="serif-italic" style={{ color: "var(--rust)" }}>page</span>,
            <br /> tout le mois.
          </h2>
          <span className="mono hidden text-[10px] uppercase tracking-[0.35em] text-[var(--stone)] md:block">
            Chapter ii · monthly check-in
          </span>
        </div>

        <div className="border border-[var(--ink)] shadow-[4px_4px_0_var(--moss-deep)] md:shadow-[8px_8px_0_var(--moss-deep)]">
          {/* Ledger header */}
          <div
            className="mono flex items-center justify-between border-b border-[var(--ink)] px-3 py-2 text-[9px] uppercase tracking-[0.2em] md:px-8 md:text-[10px] md:tracking-[0.25em]"
            style={{ background: "var(--ink)", color: "var(--cream)" }}
          >
            <span className="truncate">Wallet / Check-in · March 2026</span>
            <span className="shrink-0">Folio № 03</span>
          </div>

          {/* Ledger rows */}
          <div className="bg-[var(--cream)]">
            <Row
              label="Épargne · Revolut"
              category="Savings · 2.5%/y · DCA 500€/mo"
              before="18 938"
              delta="+41.45 (intérêts) + 500.00 (apport)"
              after="19 479"
              tone="positive"
            />
            <Row
              label="Portefeuille · Revolut"
              category="Brokerage · 7%/y · DCA 300€/mo"
              before="6 194"
              delta="+34.94 + 300.00"
              after="6 529"
              tone="positive"
            />
            <Row
              label="Maison Bomal"
              category="Real estate · 2.0%/y"
              before="546 000"
              delta="+896.48 (appréciation)"
              after="546 896"
              tone="positive"
            />
            <Row
              label="Prêt — Maison Bomal"
              category="Loan · Crelan · 3.14%"
              before="-312 000"
              delta="+936.06 (capital amorti)"
              after="-311 064"
              tone="negative-good"
            />
            <div className="mono grid grid-cols-12 gap-4 border-t-2 border-[var(--ink)] px-4 py-5 text-[13px] uppercase tracking-[0.1em] md:px-8">
              <div className="col-span-6 md:col-span-7">
                <span className="serif-italic text-[18px] normal-case tracking-normal">
                  Patrimoine net
                </span>
              </div>
              <div className="col-span-3 text-right row-num tabular-nums text-[var(--stone)]">
                259 132 €
              </div>
              <div className="col-span-3 text-right row-num tabular-nums">
                <span style={{ color: "var(--moss-deep)" }}>+ 2 708 €</span>
              </div>
            </div>
          </div>
        </div>

        <p className="serif-italic mt-6 max-w-2xl text-[15px] text-[var(--ink-soft)]">
          « Un check-in par mois. Les taux, les amortissements, les apports automatiques sont
          pré-remplis — vous ajustez ce qui change, vous signez. »
        </p>
      </section>

      {/* ──────────────────── Self-host pitch ──────────────────── */}
      <section
        className="relative overflow-hidden border-y-2 px-5 py-16 md:px-12 md:py-32"
        style={{ borderColor: "var(--ink)", background: "var(--moss-deep)", color: "var(--cream)" }}
      >
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <div className="mb-8 flex items-center gap-3">
              <Sparkles className="size-4" style={{ color: "var(--rust)" }} />
              <span className="mono text-[10px] uppercase tracking-[0.35em] text-[var(--cream)]/80">
                Deploy in 2 minutes
              </span>
            </div>
            <h2 className="serif-display text-[clamp(2.5rem,7vw,5.5rem)]">
              Your data.
              <br />
              <span className="serif-italic" style={{ color: "var(--rust)" }}>
                Your box.
              </span>{" "}
              Your rules.
            </h2>
            <p className="mt-8 max-w-xl text-[16px] leading-[1.6] text-[var(--cream)]/75">
              Clonez le repo, pointez une Postgres, configurez Google OAuth ou juste email /
              mot de passe. Wallet tourne sur un VPS à 5 €/mois, sans aucune dépendance à un
              service externe.
            </p>
          </div>

          <div className="md:col-span-5">
            <div
              className="border border-[var(--cream)]/20 bg-[color:rgba(245,239,227,0.04)] p-6"
              style={{ backdropFilter: "blur(3px)" }}
            >
              <div className="mono mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-[var(--cream)]/60">
                <span>terminal</span>
                <span>~/wallet</span>
              </div>
              <pre className="mono whitespace-pre-wrap text-[12.5px] leading-[1.7] text-[var(--cream)]/90">
                <span style={{ color: "var(--rust)" }}>$</span> git clone
                github.com/NicolasHuberty/wallet
                {"\n"}
                <span style={{ color: "var(--rust)" }}>$</span> cp .env.example .env.local
                {"\n"}
                <span style={{ color: "var(--rust)" }}>$</span> docker compose up -d
                {"\n"}
                <span style={{ color: "var(--rust)" }}>$</span> npm install && npm run db:push
                {"\n"}
                <span style={{ color: "var(--rust)" }}>$</span> npm run dev
                {"\n"}
                <span className="text-[var(--cream)]/50"># → http://localhost:3000</span>
              </pre>
              <a
                href="https://github.com/NicolasHuberty/wallet#quick-start-dev"
                target="_blank"
                rel="noreferrer"
                className="serif-italic mt-6 inline-flex items-center gap-1 text-[14px] text-[var(--rust)] underline underline-offset-4"
              >
                Guide complet de déploiement <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────── Footer ──────────────────── */}
      <footer className="mx-auto max-w-6xl px-5 py-10 md:px-12 md:py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="serif text-[22px] leading-none">
              Wallet<span className="serif-italic" style={{ color: "var(--rust)" }}>.</span>
            </div>
            <p className="mono mt-2 text-[10px] uppercase tracking-[0.25em] text-[var(--stone)]">
              2026 · Brussels, Belgium · MIT License
            </p>
          </div>
          <div className="mono flex flex-wrap items-center gap-6 text-[12px]">
            <a
              href="https://github.com/NicolasHuberty/wallet"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
<GithubGlyph size={12} /> github.com/NicolasHuberty/wallet
            </a>
            <Link
              href="/login"
              className="text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              Sign up
            </Link>
          </div>
        </div>
        <div className="mt-8 rule" />
        <p className="serif-italic mt-8 max-w-2xl text-[14px] text-[var(--stone)]">
          Built by <a href="https://github.com/NicolasHuberty" className="underline decoration-[var(--rust)] underline-offset-4">@NicolasHuberty</a> · Contributions welcome — open an issue or a PR
          on the repo.
        </p>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    title: "One page,\nall your finances.",
    body:
      "Comptes bancaires, épargne, portefeuilles-titres, crypto, immobilier, crédits — sur une seule page. Tapez la valeur, pas la saga.",
    tags: ["Accounts", "ETFs", "Credits", "Real estate"],
  },
  {
    title: "Monthly\ncheck-in.",
    body:
      "Un seul formulaire mensuel. Intérêts pré-calculés, amortissement automatique depuis votre tableau de prêt, moyennes des dépenses récurrentes, templates pour les frais one-shot.",
    tags: ["Snapshots", "Amortization", "Templates"],
  },
  {
    title: "History\n× Projection.",
    body:
      "Chaque compte porte son taux et son apport. Voyez d'où vous venez (historique) et où vous allez (Monte-Carlo) sur un seul graphique.",
    tags: ["CAGR", "Monte-Carlo", "DCA"],
  },
];

function Row({
  label,
  category,
  before,
  delta,
  after,
  tone,
}: {
  label: string;
  category: string;
  before: string;
  delta: string;
  after: string;
  tone: "positive" | "negative-good";
}) {
  const toneColor =
    tone === "positive" ? "var(--moss-deep)" : "var(--moss-deep)"; // same green for both (good)
  return (
    <div
      className="grid grid-cols-12 items-baseline gap-4 border-b border-[var(--hairline)] px-4 py-4 text-[13px] md:px-8"
    >
      <div className="col-span-12 md:col-span-5">
        <div className="serif text-[16px]">{label}</div>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--stone)]">
          {category}
        </div>
      </div>
      <div className="col-span-4 md:col-span-2 text-right mono tabular-nums text-[var(--stone)]">
        <span className="block md:hidden text-[9px] uppercase tracking-[0.2em] text-[var(--stone)]/60">Before</span>
        {before} €
      </div>
      <div className="col-span-8 md:col-span-3 mono text-[11px] text-[var(--ink-soft)] md:text-right">
        <span className="block md:hidden text-[9px] uppercase tracking-[0.2em] text-[var(--stone)]/60">Δ</span>
        {delta}
      </div>
      <div
        className="col-span-12 md:col-span-2 text-right mono tabular-nums text-[15px] font-medium"
        style={{ color: toneColor }}
      >
        <span className="block md:hidden text-[9px] uppercase tracking-[0.2em] text-[var(--stone)]/60">After</span>
        {after} €
      </div>
    </div>
  );
}

function Item({
  label,
  value,
  reverse,
}: {
  label: string;
  value: string;
  reverse?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={reverse ? "text-[var(--rust)]" : "text-[var(--ink-soft)]"}>
        {reverse ? label : value}
      </span>
      <span className={reverse ? "text-[var(--ink-soft)]" : "text-[var(--stone)]"}>
        {reverse ? value : label}
      </span>
    </div>
  );
}

function Dot() {
  return (
    <span className="size-1.5 rounded-full" style={{ background: "var(--stone)" }} />
  );
}

function GithubGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      fill="currentColor"
      className="inline-block"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
