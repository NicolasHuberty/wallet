"use server";

import { db, schema } from "@/db";
import { and, eq, lte, gte } from "drizzle-orm";
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
      for (const t of all) {
        const ext = txExternalId(t);
        const amount = parseFloat(t.transactionAmount.amount);
        if (!isFinite(amount)) continue;
        const date = txDate(t);
        const kind = classifyTxKind(t);
        const notes = txDescription(t);

        if (ext) {
          const [existing] = await db
            .select()
            .from(schema.accountCashflow)
            .where(
              and(
                eq(schema.accountCashflow.accountId, acc.id),
                eq(schema.accountCashflow.externalId, ext),
              ),
            );
          if (existing) {
            await db
              .update(schema.accountCashflow)
              .set({ amount, kind, date, notes, updatedAt: now })
              .where(eq(schema.accountCashflow.id, existing.id));
            transactionsUpdated++;
            continue;
          }
        }
        await db.insert(schema.accountCashflow).values({
          accountId: acc.id,
          date,
          kind,
          amount,
          notes,
          source: "bank_sync",
          externalId: ext,
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
