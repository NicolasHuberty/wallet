"use server";

import { db, schema } from "@/db";
import { and, eq, inArray, lte, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getPrimaryHousehold } from "@/lib/queries";
import { recomputeSnapshot } from "@/lib/snapshots";
import { assertWritable } from "@/lib/demo";
import {
  createRequisition,
  deleteRequisition,
  getAccountBalances,
  getAccountDetails,
  getAccountTransactions,
  getRequisition,
  isConfigured,
  listInstitutions,
  pickPrimaryBalance,
  type GcTransaction,
  type Institution,
} from "@/lib/gocardless";
import type { CashflowKind } from "@/db/schema";
import {
  classifyTransaction,
  type TransactionCategory,
} from "@/lib/transaction-categorizer";
import {
  looksLikePerson,
  naceToCategory,
  normalizeBceName,
} from "@/lib/bce";

function requireConfigured() {
  if (!isConfigured()) {
    throw new Error(
      "GoCardless n'est pas configuré. Renseigne GOCARDLESS_SECRET_ID et GOCARDLESS_SECRET_KEY dans les env vars Coolify.",
    );
  }
}

function baseUrl(): string {
  return process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

// ─── Start a new connection ──────────────────────────────────────────
const startSchema = z.object({
  institutionId: z.string().min(1),
  institutionName: z.string().min(1),
  institutionLogo: z.string().nullable().optional(),
});

export async function startBankConnection(values: z.infer<typeof startSchema>) {
  assertWritable();
  requireConfigured();
  const p = startSchema.parse(values);
  const h = await getPrimaryHousehold();
  const reference = `${h.id}_${nanoid(10)}`;
  const redirect = `${baseUrl()}/api/banking/callback`;
  const requisition = await createRequisition({
    institutionId: p.institutionId,
    redirect,
    reference,
    userLanguage: "FR",
  });
  await db.insert(schema.bankConnection).values({
    householdId: h.id,
    institutionId: p.institutionId,
    institutionName: p.institutionName,
    institutionLogo: p.institutionLogo ?? null,
    requisitionId: requisition.id,
    reference,
    status: "pending",
    updatedAt: new Date(),
  });
  return { link: requisition.link, requisitionId: requisition.id };
}

// ─── Link a fetched bank account to one of our app accounts ───────────
const linkSchema = z.object({
  connectionId: z.string().min(1),
  goCardlessAccountId: z.string().min(1),
  appAccountId: z.string().min(1),
});

export async function linkBankAccount(values: z.infer<typeof linkSchema>) {
  assertWritable();
  const p = linkSchema.parse(values);
  const h = await getPrimaryHousehold();
  const [conn] = await db
    .select()
    .from(schema.bankConnection)
    .where(and(eq(schema.bankConnection.id, p.connectionId), eq(schema.bankConnection.householdId, h.id)));
  if (!conn) throw new Error("Connexion bancaire introuvable");
  const [acc] = await db
    .select()
    .from(schema.account)
    .where(and(eq(schema.account.id, p.appAccountId), eq(schema.account.householdId, h.id)));
  if (!acc) throw new Error("Compte introuvable");
  await db
    .update(schema.account)
    .set({
      goCardlessAccountId: p.goCardlessAccountId,
      bankConnectionId: conn.id,
      updatedAt: new Date(),
    })
    .where(eq(schema.account.id, acc.id));
  revalidatePath("/banking");
  revalidatePath("/accounts");
}

// ─── Unlink a bank account from an app account ────────────────────────
export async function unlinkBankAccount(appAccountId: string) {
  assertWritable();
  await db
    .update(schema.account)
    .set({
      goCardlessAccountId: null,
      bankConnectionId: null,
      lastBankSyncAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.account.id, appAccountId));
  revalidatePath("/banking");
  revalidatePath("/accounts");
}

// ─── Sync all linked accounts of a connection ─────────────────────────
const syncSchema = z.object({ connectionId: z.string().min(1) });

function classifyTxKind(t: GcTransaction): CashflowKind {
  const amt = parseFloat(t.transactionAmount.amount);
  const desc = (
    t.remittanceInformationUnstructured ??
    (t.remittanceInformationUnstructuredArray ?? []).join(" ") ??
    ""
  ).toLowerCase();
  if (desc.includes("dividend") || desc.includes("dividende")) return "dividend";
  if (desc.includes("intérêt") || desc.includes("interet") || desc.includes("interest"))
    return "interest";
  if (
    desc.includes("commission") ||
    desc.includes("frais") ||
    desc.includes("management fee") ||
    desc.includes("robo")
  )
    return "fee";
  return amt >= 0 ? "deposit" : "withdrawal";
}

function txDate(t: GcTransaction): Date {
  const d = t.bookingDate ?? t.valueDate ?? t.bookingDateTime;
  if (!d) return new Date();
  return new Date(d);
}

function txExternalId(t: GcTransaction): string | null {
  return t.transactionId ?? t.internalTransactionId ?? null;
}

function txDescription(t: GcTransaction): string | null {
  const lines = [
    t.creditorName,
    t.debtorName,
    t.remittanceInformationUnstructured,
    ...(t.remittanceInformationUnstructuredArray ?? []),
  ].filter(Boolean) as string[];
  return lines.length > 0 ? lines.slice(0, 2).join(" — ").slice(0, 280) : null;
}

// Returns the most likely company name to feed into BCE lookup. Prefers the
// counterparty name fields over the free-form remittance string.
function txCounterpartyName(t: GcTransaction): string | null {
  return t.creditorName ?? t.debtorName ?? t.remittanceInformationUnstructured ?? null;
}

// Run BCE lookup in batch, then fall back to regex per transaction.
// Returns a parallel array of resolved categories.
type ResolvedCategory = {
  category: TransactionCategory;
  source: "bce" | "regex";
  bceEnterpriseNumber: string | null;
};

async function resolveCategoriesBatch(
  inputs: Array<{ amount: number; notes: string | null; counterparty: string | null; kind: CashflowKind }>,
): Promise<ResolvedCategory[]> {
  // Build the set of unique normalised search names from counterparty fields
  const searchKeys = new Set<string>();
  const normByIndex = new Array<string | null>(inputs.length);
  for (let i = 0; i < inputs.length; i++) {
    const cp = inputs[i].counterparty;
    if (!cp) {
      normByIndex[i] = null;
      continue;
    }
    const norm = normalizeBceName(cp);
    if (!norm || looksLikePerson(norm)) {
      normByIndex[i] = null;
      continue;
    }
    normByIndex[i] = norm;
    searchKeys.add(norm);
  }

  // Single batch query — exact match only (covers ~70 % of company hits;
  // prefix/substring fallback is reserved for the on-demand single-tx
  // categorize-this-row path which we'll add later if needed).
  const matchByName = new Map<string, { enterpriseNumber: string; naceCode: string | null }>();
  if (searchKeys.size > 0) {
    const rows = await db
      .select({
        searchName: schema.bceCompany.searchName,
        enterpriseNumber: schema.bceCompany.enterpriseNumber,
        naceCode: schema.bceCompany.naceCode,
      })
      .from(schema.bceCompany)
      .where(inArray(schema.bceCompany.searchName, Array.from(searchKeys)));
    for (const r of rows) {
      // First-write wins (BCE companies are unique by enterpriseNumber but
      // searchName collisions can happen for big retailers with multiple
      // legal entities — we just keep the first match)
      if (!matchByName.has(r.searchName))
        matchByName.set(r.searchName, {
          enterpriseNumber: r.enterpriseNumber,
          naceCode: r.naceCode,
        });
    }
  }

  // Resolve per row
  const out: ResolvedCategory[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const norm = normByIndex[i];
    if (norm) {
      const m = matchByName.get(norm);
      if (m) {
        const cat = naceToCategory(m.naceCode);
        if (cat) {
          out.push({ category: cat, source: "bce", bceEnterpriseNumber: m.enterpriseNumber });
          continue;
        }
      }
    }
    // Regex fallback
    const cat = classifyTransaction({
      amount: inputs[i].amount,
      notes: inputs[i].notes,
      existingKind: inputs[i].kind,
    });
    out.push({ category: cat, source: "regex", bceEnterpriseNumber: null });
  }
  return out;
}

export async function syncBankConnection(values: z.infer<typeof syncSchema>) {
  assertWritable();
  requireConfigured();
  const p = syncSchema.parse(values);
  const h = await getPrimaryHousehold();
  const [conn] = await db
    .select()
    .from(schema.bankConnection)
    .where(and(eq(schema.bankConnection.id, p.connectionId), eq(schema.bankConnection.householdId, h.id)));
  if (!conn) throw new Error("Connexion introuvable");
  if (conn.status !== "active") throw new Error("Connexion non active — ré-autorise la banque");

  const linkedAccounts = await db
    .select()
    .from(schema.account)
    .where(
      and(eq(schema.account.bankConnectionId, conn.id), eq(schema.account.householdId, h.id)),
    );

  let accountsSynced = 0;
  let transactionsAdded = 0;
  let transactionsUpdated = 0;
  const now = new Date();

  for (const acc of linkedAccounts) {
    const gcId = acc.goCardlessAccountId;
    if (!gcId) continue;
    accountsSynced++;

    // Balance → updates currentValue + writes a snapshot for today
    try {
      const { balances } = await getAccountBalances(gcId);
      const primary = pickPrimaryBalance(balances);
      if (primary) {
        const balValue = parseFloat(primary.balanceAmount.amount);
        await db
          .update(schema.account)
          .set({ currentValue: balValue, lastBankSyncAt: now, updatedAt: now })
          .where(eq(schema.account.id, acc.id));
        // Upsert today's snapshot
        const startDay = new Date(now);
        startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(now);
        endDay.setHours(23, 59, 59, 999);
        const [existing] = await db
          .select()
          .from(schema.accountSnapshot)
          .where(
            and(
              eq(schema.accountSnapshot.accountId, acc.id),
              gte(schema.accountSnapshot.date, startDay),
              lte(schema.accountSnapshot.date, endDay),
            ),
          );
        if (existing) {
          await db
            .update(schema.accountSnapshot)
            .set({ value: balValue, updatedAt: now })
            .where(eq(schema.accountSnapshot.id, existing.id));
        } else {
          await db.insert(schema.accountSnapshot).values({
            accountId: acc.id,
            date: now,
            value: balValue,
            updatedAt: now,
          });
        }
      }
    } catch (e) {
      // Continue with transactions even if balance failed
      console.error("balance fetch failed", e);
    }

    // Transactions → upsert as cashflow rows by externalId
    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 90); // PSD2 caps at 90 days for many banks
      const { transactions } = await getAccountTransactions(gcId, {
        dateFrom: dateFrom.toISOString().slice(0, 10),
      });
      const all = [...(transactions.booked ?? []), ...(transactions.pending ?? [])];

      // Pre-compute (amount, kind, notes, counterparty) for each tx, then
      // batch-resolve categories via BCE → regex.
      type TxPrep = {
        t: GcTransaction;
        ext: string | null;
        amount: number;
        date: Date;
        kind: CashflowKind;
        notes: string | null;
        counterparty: string | null;
      };
      const prepared: TxPrep[] = [];
      for (const t of all) {
        const amount = parseFloat(t.transactionAmount.amount);
        if (!isFinite(amount)) continue;
        prepared.push({
          t,
          ext: txExternalId(t),
          amount,
          date: txDate(t),
          kind: classifyTxKind(t),
          notes: txDescription(t),
          counterparty: txCounterpartyName(t),
        });
      }
      const resolved = await resolveCategoriesBatch(
        prepared.map((p) => ({
          amount: p.amount,
          notes: p.notes,
          counterparty: p.counterparty,
          kind: p.kind,
        })),
      );

      for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i];
        const r = resolved[i];

        if (p.ext) {
          const [existing] = await db
            .select()
            .from(schema.accountCashflow)
            .where(
              and(
                eq(schema.accountCashflow.accountId, acc.id),
                eq(schema.accountCashflow.externalId, p.ext),
              ),
            );
          if (existing) {
            // Don't overwrite a user-set category (categorySource = 'user')
            const preserveCategory = existing.categorySource === "user";
            await db
              .update(schema.accountCashflow)
              .set({
                amount: p.amount,
                kind: p.kind,
                date: p.date,
                notes: p.notes,
                ...(preserveCategory
                  ? {}
                  : {
                      category: r.category,
                      categorySource: r.source,
                      bceEnterpriseNumber: r.bceEnterpriseNumber,
                    }),
                updatedAt: now,
              })
              .where(eq(schema.accountCashflow.id, existing.id));
            transactionsUpdated++;
            continue;
          }
        }
        await db.insert(schema.accountCashflow).values({
          accountId: acc.id,
          date: p.date,
          kind: p.kind,
          amount: p.amount,
          notes: p.notes,
          source: "bank_sync",
          externalId: p.ext,
          category: r.category,
          categorySource: r.source,
          bceEnterpriseNumber: r.bceEnterpriseNumber,
          updatedAt: now,
        });
        transactionsAdded++;
      }
    } catch (e) {
      console.error("transactions fetch failed", e);
    }
  }

  await recomputeSnapshot(h.id);
  revalidatePath("/banking");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { accountsSynced, transactionsAdded, transactionsUpdated };
}

// ─── Fetch supported institutions for a country ─────────────────────
export async function fetchInstitutions(country: string): Promise<Institution[]> {
  requireConfigured();
  return listInstitutions(country.toUpperCase());
}

// ─── Fetch the GoCardless accounts of a connection (for mapping UI) ──
const fetchAccountsSchema = z.object({ connectionId: z.string().min(1) });

export type FetchedBankAccount = {
  goCardlessAccountId: string;
  iban: string | null;
  ownerName: string | null;
  currency: string | null;
  name: string | null;
  product: string | null;
};

export async function fetchConnectionAccounts(
  values: z.infer<typeof fetchAccountsSchema>,
): Promise<FetchedBankAccount[]> {
  requireConfigured();
  const p = fetchAccountsSchema.parse(values);
  const h = await getPrimaryHousehold();
  const [conn] = await db
    .select()
    .from(schema.bankConnection)
    .where(and(eq(schema.bankConnection.id, p.connectionId), eq(schema.bankConnection.householdId, h.id)));
  if (!conn) throw new Error("Connexion introuvable");
  const req_ = await getRequisition(conn.requisitionId);
  const out: FetchedBankAccount[] = [];
  for (const id of req_.accounts) {
    try {
      const d = await getAccountDetails(id);
      out.push({
        goCardlessAccountId: id,
        iban: d.account.iban ?? null,
        ownerName: d.account.ownerName ?? null,
        currency: d.account.currency ?? null,
        name: d.account.name ?? null,
        product: d.account.product ?? null,
      });
    } catch (e) {
      console.error(`getAccountDetails(${id}) failed`, e);
      out.push({
        goCardlessAccountId: id,
        iban: null,
        ownerName: null,
        currency: null,
        name: null,
        product: null,
      });
    }
  }
  return out;
}

// ─── Re-categorize all cashflows for an account ─────────────────────
// Useful after a BCE import refresh, or to backfill old rows that were
// created before the BCE pipeline existed. Skips rows the user has
// manually overridden (categorySource = 'user').

const recatSchema = z.object({ accountId: z.string().min(1) });

export async function recategorizeAccount(
  values: z.infer<typeof recatSchema>,
): Promise<{ updated: number; bceMatches: number }> {
  assertWritable();
  const p = recatSchema.parse(values);
  const h = await getPrimaryHousehold();
  const [acc] = await db
    .select()
    .from(schema.account)
    .where(and(eq(schema.account.id, p.accountId), eq(schema.account.householdId, h.id)));
  if (!acc) throw new Error("Compte introuvable");

  const rows = await db
    .select()
    .from(schema.accountCashflow)
    .where(eq(schema.accountCashflow.accountId, acc.id));

  // Skip user-overridden rows
  const target = rows.filter((r) => r.categorySource !== "user");
  if (target.length === 0) return { updated: 0, bceMatches: 0 };

  const resolved = await resolveCategoriesBatch(
    target.map((r) => ({
      amount: r.amount,
      notes: r.notes,
      counterparty: r.notes, // we don't store counterparty separately yet — use notes
      kind: r.kind as CashflowKind,
    })),
  );

  let bceMatches = 0;
  const now = new Date();
  for (let i = 0; i < target.length; i++) {
    const r = target[i];
    const cat = resolved[i];
    if (cat.source === "bce") bceMatches++;
    await db
      .update(schema.accountCashflow)
      .set({
        category: cat.category,
        categorySource: cat.source,
        bceEnterpriseNumber: cat.bceEnterpriseNumber,
        updatedAt: now,
      })
      .where(eq(schema.accountCashflow.id, r.id));
  }

  revalidatePath(`/accounts/${acc.id}`);
  return { updated: target.length, bceMatches };
}

// ─── Manual override of a single cashflow's category ─────────────────
// First step of the user-feedback loop. Sets categorySource = 'user' so
// future re-categorizations / re-syncs leave it alone.

const setCategorySchema = z.object({
  cashflowId: z.string().min(1),
  category: z.string().min(1),
});

export async function setCashflowCategory(
  values: z.infer<typeof setCategorySchema>,
) {
  assertWritable();
  const p = setCategorySchema.parse(values);
  const h = await getPrimaryHousehold();
  const [row] = await db
    .select({
      id: schema.accountCashflow.id,
      accountId: schema.accountCashflow.accountId,
      householdId: schema.account.householdId,
    })
    .from(schema.accountCashflow)
    .innerJoin(schema.account, eq(schema.accountCashflow.accountId, schema.account.id))
    .where(eq(schema.accountCashflow.id, p.cashflowId));
  if (!row || row.householdId !== h.id) throw new Error("Mouvement introuvable");

  await db
    .update(schema.accountCashflow)
    .set({
      category: p.category,
      categorySource: "user",
      updatedAt: new Date(),
    })
    .where(eq(schema.accountCashflow.id, p.cashflowId));

  revalidatePath(`/accounts/${row.accountId}`);
}

// ─── Disconnect / delete a bank connection ────────────────────────────
export async function disconnectBank(connectionId: string) {
  assertWritable();
  const h = await getPrimaryHousehold();
  const [conn] = await db
    .select()
    .from(schema.bankConnection)
    .where(and(eq(schema.bankConnection.id, connectionId), eq(schema.bankConnection.householdId, h.id)));
  if (!conn) throw new Error("Connexion introuvable");

  // Best-effort GoCardless cleanup
  if (isConfigured()) {
    try {
      await deleteRequisition(conn.requisitionId);
    } catch (e) {
      console.error("requisition delete failed (continuing)", e);
    }
  }

  // Unlink accounts pointing at this connection
  await db
    .update(schema.account)
    .set({
      bankConnectionId: null,
      goCardlessAccountId: null,
      lastBankSyncAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.account.bankConnectionId, conn.id));

  await db.delete(schema.bankConnection).where(eq(schema.bankConnection.id, conn.id));
  revalidatePath("/banking");
  revalidatePath("/accounts");
}
