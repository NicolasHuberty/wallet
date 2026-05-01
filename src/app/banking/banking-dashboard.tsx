"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Building2,
  RefreshCw,
  Trash2,
  Link as LinkIcon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  startBankConnection,
  syncBankConnection,
  disconnectBank,
  fetchInstitutions,
  fetchConnectionAccounts,
  linkBankAccount,
  unlinkBankAccount,
  type FetchedBankAccount,
} from "./actions";
import type { Institution } from "@/lib/gocardless";
import { formatEUR, formatDateFR } from "@/lib/format";
import { accountKindLabel, accountKindColor } from "@/lib/labels";
import type { AccountKind } from "@/db/schema";

type AppAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  currentValue: number;
  goCardlessAccountId: string | null;
  bankConnectionId: string | null;
  lastBankSyncAt: string | null;
};

type Connection = {
  id: string;
  institutionId: string;
  institutionName: string;
  institutionLogo: string | null;
  status: "pending" | "active" | "expired" | "error";
  acceptedAt: string | null;
  expiresAt: string | null;
  errorMessage: string | null;
  linkedAccountIds: string[];
};

export function BankingDashboard({
  accounts,
  connections,
  configured,
  connectedConnectionId,
  error,
}: {
  accounts: AppAccount[];
  connections: Connection[];
  configured: boolean;
  connectedConnectionId: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [pending, start] = useTransition();
  const [country, setCountry] = useState("BE");
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (error) {
      const map: Record<string, string> = {
        "missing-ref": "Référence manquante dans le retour de la banque",
        "not-configured": "GoCardless non configuré",
        "unknown-ref": "Connexion introuvable",
        "auth-failed": "Tu n'as pas autorisé l'accès à la banque",
        "callback-failed": "Erreur lors du retour banque",
      };
      toast.error(map[error] ?? `Erreur : ${error}`);
    }
  }, [error]);

  useEffect(() => {
    if (!showPicker || institutions != null) return;
    start(async () => {
      try {
        const list = await fetchInstitutions(country);
        setInstitutions(list);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }, [showPicker, country, institutions]);

  function startFlow(institution: Institution) {
    start(async () => {
      try {
        const res = await startBankConnection({
          institutionId: institution.id,
          institutionName: institution.name,
          institutionLogo: institution.logo ?? null,
        });
        window.location.href = res.link;
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (!configured) {
    return (
      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-3 text-sm">
            <h2 className="font-semibold text-amber-700 dark:text-amber-300">
              GoCardless n&apos;est pas encore configuré
            </h2>
            <p className="text-amber-700/90 dark:text-amber-300/90">
              Pour activer la synchronisation auto avec ta banque (BNP, Belfius, KBC, ING, Revolut
              cash, etc.), tu dois créer un compte gratuit chez GoCardless Bank Account Data, puis
              ajouter deux variables d&apos;environnement à ton déploiement Coolify.
            </p>
            <ol className="ml-4 list-decimal space-y-1.5 text-amber-700/90 dark:text-amber-300/90">
              <li>
                Va sur{" "}
                <a
                  className="underline"
                  href="https://bankaccountdata.gocardless.com/register/"
                  target="_blank"
                  rel="noreferrer"
                >
                  bankaccountdata.gocardless.com/register
                </a>{" "}
                et inscris-toi (gratuit, ~2 min, demande juste une adresse email).
              </li>
              <li>
                Une fois connecté, va dans <em>User secrets</em> et clique{" "}
                <em>Create new</em>. Note le <code>Secret ID</code> et le <code>Secret Key</code>.
              </li>
              <li>
                Dans Coolify, ouvre l&apos;app <em>wallet</em> → onglet{" "}
                <em>Environment variables</em>. Ajoute :
                <ul className="ml-4 mt-1 list-disc">
                  <li>
                    <code>GOCARDLESS_SECRET_ID</code>
                  </li>
                  <li>
                    <code>GOCARDLESS_SECRET_KEY</code>
                  </li>
                </ul>
              </li>
              <li>Redéploie l&apos;application (ou attends le prochain push).</li>
            </ol>
            <p className="text-xs text-amber-700/70 dark:text-amber-300/70">
              Limite PSD2 : 4 syncs / jour / institution, et le consentement doit être renouvelé
              tous les 90 jours.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {connections.length === 0
            ? "Aucune connexion bancaire active."
            : `${connections.length} connexion${connections.length > 1 ? "s" : ""} active${connections.length > 1 ? "s" : ""}.`}
        </div>
        <Button onClick={() => setShowPicker((v) => !v)}>
          <Plus className="size-4" />
          Connecter une banque
        </Button>
      </div>

      {/* Institution picker */}
      {showPicker && (
        <section className="rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="mb-3 flex items-center gap-3">
            <h3 className="flex-1 text-sm font-semibold sm:text-base">Choisis ta banque</h3>
            <Select value={country} onValueChange={(v) => { setCountry(v ?? "BE"); setInstitutions(null); }}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BE">🇧🇪 Belgique</SelectItem>
                <SelectItem value="FR">🇫🇷 France</SelectItem>
                <SelectItem value="NL">🇳🇱 Pays-Bas</SelectItem>
                <SelectItem value="LU">🇱🇺 Luxembourg</SelectItem>
                <SelectItem value="DE">🇩🇪 Allemagne</SelectItem>
                <SelectItem value="ES">🇪🇸 Espagne</SelectItem>
                <SelectItem value="IT">🇮🇹 Italie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Filtrer (BNP, Revolut, ING…)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-3 h-9"
          />
          {institutions == null && pending && (
            <p className="text-xs text-muted-foreground">Chargement…</p>
          )}
          {institutions != null && (
            <ul className="grid gap-2 md:grid-cols-2">
              {institutions
                .filter((i) =>
                  filter ? i.name.toLowerCase().includes(filter.toLowerCase()) : true,
                )
                .map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => startFlow(i)}
                      disabled={pending}
                      className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-[var(--chart-1)] disabled:opacity-50"
                    >
                      {i.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={i.logo}
                          alt=""
                          className="size-8 shrink-0 rounded object-contain"
                        />
                      ) : (
                        <Building2 className="size-8 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{i.name}</div>
                        {i.bic && (
                          <div className="truncate text-[10px] font-mono text-muted-foreground">
                            {i.bic}
                          </div>
                        )}
                      </div>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {/* Connection cards */}
      {connections.length > 0 && (
        <section className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              conn={c}
              accounts={accounts}
              autoExpand={c.id === connectedConnectionId}
              onSync={() =>
                start(async () => {
                  try {
                    const r = await syncBankConnection({ connectionId: c.id });
                    toast.success(
                      `Synchronisé · ${r.accountsSynced} compte(s) · ${r.transactionsAdded} nouvelles transactions${r.transactionsUpdated ? ` · ${r.transactionsUpdated} mises à jour` : ""}`,
                    );
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                })
              }
              onDisconnect={() =>
                start(async () => {
                  if (!confirm(`Déconnecter ${c.institutionName} ?`)) return;
                  try {
                    await disconnectBank(c.id);
                    toast.success("Déconnecté");
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                })
              }
              pending={pending}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ConnectionCard({
  conn,
  accounts,
  autoExpand,
  onSync,
  onDisconnect,
  pending,
}: {
  conn: Connection;
  accounts: AppAccount[];
  autoExpand: boolean;
  onSync: () => void;
  onDisconnect: () => void;
  pending: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(autoExpand || conn.linkedAccountIds.length === 0);
  const [bankAccounts, setBankAccounts] = useState<FetchedBankAccount[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || bankAccounts != null) return;
    if (conn.status !== "active") return;
    setLoading(true);
    fetchConnectionAccounts({ connectionId: conn.id })
      .then(setBankAccounts)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [expanded, bankAccounts, conn.id, conn.status]);

  const expiresIn = conn.expiresAt ? Math.floor((new Date(conn.expiresAt).getTime() - Date.now()) / (1000 * 3600 * 24)) : null;
  const expiringSoon = expiresIn != null && expiresIn < 14;

  const statusBadge = (() => {
    switch (conn.status) {
      case "active":
        return (
          <Badge className="bg-[var(--color-success)]/15 text-[var(--color-success)]">
            <CheckCircle2 className="size-3" /> Actif
          </Badge>
        );
      case "pending":
        return <Badge variant="outline">En attente</Badge>;
      case "expired":
        return <Badge variant="destructive">Expiré</Badge>;
      case "error":
        return <Badge variant="destructive">Erreur</Badge>;
    }
  })();

  const linkedAccounts = accounts.filter((a) => a.bankConnectionId === conn.id);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        {conn.institutionLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={conn.institutionLogo}
            alt=""
            className="size-8 shrink-0 rounded object-contain"
          />
        ) : (
          <Building2 className="size-8 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{conn.institutionName}</div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {statusBadge}
            {linkedAccounts.length > 0 && (
              <span>
                {linkedAccounts.length} compte{linkedAccounts.length > 1 ? "s" : ""} lié
                {linkedAccounts.length > 1 ? "s" : ""}
              </span>
            )}
            {conn.acceptedAt && (
              <span>connecté le {formatDateFR(new Date(conn.acceptedAt))}</span>
            )}
            {expiresIn != null && (
              <span className={expiringSoon ? "text-amber-600 dark:text-amber-400" : ""}>
                expire dans {expiresIn} jour{expiresIn > 1 ? "s" : ""}
              </span>
            )}
            {conn.errorMessage && <span className="text-destructive">{conn.errorMessage}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {conn.status === "active" && (
            <Button size="sm" variant="outline" onClick={onSync} disabled={pending}>
              <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
              Sync
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Réduire" : "Détails"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-destructive hover:text-destructive"
            onClick={onDisconnect}
            disabled={pending}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 p-4">
          {linkedAccounts.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comptes liés
              </div>
              <ul className="space-y-1.5">
                {linkedAccounts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: accountKindColor[a.kind] }}
                      />
                      <span className="truncate font-medium">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {accountKindLabel[a.kind]}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="numeric tabular-nums">{formatEUR(a.currentValue)}</span>
                      {a.lastBankSyncAt && (
                        <span className="text-[10px] text-muted-foreground">
                          sync {formatDateFR(new Date(a.lastBankSyncAt))}
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() =>
                          confirm(`Délier ${a.name} ?`) &&
                          unlinkBankAccount(a.id).then(() => router.refresh())
                        }
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {conn.status === "active" && (
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comptes bancaires disponibles
              </div>
              {loading && <p className="text-xs text-muted-foreground">Chargement…</p>}
              {bankAccounts != null && (
                <ul className="space-y-2">
                  {bankAccounts.map((b) => {
                    const linked = linkedAccounts.find(
                      (a) => a.goCardlessAccountId === b.goCardlessAccountId,
                    );
                    return (
                      <li
                        key={b.goCardlessAccountId}
                        className="rounded-md border border-border bg-background p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-medium">{b.name ?? b.product ?? "Compte"}</div>
                            {b.iban && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {b.iban}
                              </div>
                            )}
                            {b.ownerName && (
                              <div className="text-[10px] text-muted-foreground">
                                {b.ownerName}
                              </div>
                            )}
                          </div>
                          {b.currency && (
                            <Badge variant="outline" className="text-[10px]">
                              {b.currency}
                            </Badge>
                          )}
                        </div>
                        {linked ? (
                          <div className="flex items-center gap-2 text-[11px] text-[var(--color-success)]">
                            <CheckCircle2 className="size-3.5" /> Lié à{" "}
                            <strong>{linked.name}</strong>
                          </div>
                        ) : (
                          <LinkAccountForm
                            connectionId={conn.id}
                            goCardlessAccountId={b.goCardlessAccountId}
                            availableAccounts={accounts.filter(
                              (a) =>
                                !a.goCardlessAccountId &&
                                (a.kind === "savings" ||
                                  a.kind === "cash" ||
                                  a.kind === "brokerage" ||
                                  a.kind === "credit_card"),
                            )}
                            onLinked={() => router.refresh()}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinkAccountForm({
  connectionId,
  goCardlessAccountId,
  availableAccounts,
  onLinked,
}: {
  connectionId: string;
  goCardlessAccountId: string;
  availableAccounts: AppAccount[];
  onLinked: () => void;
}) {
  const [appAccountId, setAppAccountId] = useState<string | undefined>(undefined);
  const [pending, start] = useTransition();

  function submit() {
    if (!appAccountId) {
      toast.error("Choisis un compte de destination");
      return;
    }
    start(async () => {
      try {
        await linkBankAccount({ connectionId, goCardlessAccountId, appAccountId });
        toast.success("Lié");
        onLinked();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (availableAccounts.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Crée d&apos;abord un compte (Épargne / Cash) dans la page <em>Comptes</em>.
      </p>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
      <Select value={appAccountId} onValueChange={(v) => setAppAccountId(v ?? undefined)}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Lier à…" />
        </SelectTrigger>
        <SelectContent>
          {availableAccounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ background: accountKindColor[a.kind] }}
                />
                {a.name} <span className="text-[10px] text-muted-foreground">({accountKindLabel[a.kind]})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={submit} disabled={pending}>
        <LinkIcon className="size-3.5" />
        Lier
      </Button>
    </div>
  );
}

function _Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
