// GoCardless Bank Account Data — REST client (formerly Nordigen).
//
// PSD2 EU open-banking aggregator. Free for non-commercial use.
// Auth flow:
//   1. POST /token/new {secret_id, secret_key} -> {access, refresh} (24 h)
//   2. GET /institutions/?country=BE -> list of banks
//   3. POST /requisitions/ {institution_id, redirect, reference}
//      -> {id, link} ; redirect user to `link`
//   4. After auth on the bank's side, GoCardless redirects to
//      `${redirect}?ref=${reference}`
//   5. GET /requisitions/{id} -> {accounts: [account_id, ...]}
//   6. GET /accounts/{id}/balances/   (rate-limited, ~4/day)
//   7. GET /accounts/{id}/transactions/?date_from=...
//
// All money values are in major units (EUR), already with sign convention
// (positive = credit, negative = debit) — convenient for our cashflow rows.

const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

export type Institution = {
  id: string;
  name: string;
  bic?: string;
  transaction_total_days?: string;
  countries: string[];
  logo: string;
};

export type RequisitionCreated = {
  id: string;
  redirect: string;
  status: string;
  agreements: string;
  accounts: string[];
  reference: string;
  link: string;
  ssn: string | null;
  account_selection: boolean;
  redirect_immediate: boolean;
};

export type Requisition = {
  id: string;
  status: string; // CR (created) | LN (linked) | EX (expired) | RJ (rejected) | UA (user_accepted)
  redirect: string;
  agreements: string;
  reference: string;
  accounts: string[]; // bank account UUIDs (only populated once linked)
  link: string;
  institution_id: string;
};

export type AccountDetails = {
  account: {
    iban?: string;
    bban?: string;
    currency?: string;
    name?: string;
    product?: string;
    cashAccountType?: string;
    ownerName?: string;
  };
};

export type Balance = {
  balanceAmount: { amount: string; currency: string };
  balanceType: string; // closingBooked | interimAvailable | expected | ...
  referenceDate?: string;
};

export type GcTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  bookingDateTime?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  bankTransactionCode?: string;
  proprietaryBankTransactionCode?: string;
};

export class GoCardlessError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "GoCardlessError";
    this.status = status;
    this.body = body;
  }
}

let tokenCache: { access: string; refresh: string; expiresAt: number } | null = null;

function creds() {
  const id = process.env.GOCARDLESS_SECRET_ID;
  const key = process.env.GOCARDLESS_SECRET_KEY;
  if (!id || !key) {
    throw new GoCardlessError(
      "GoCardless credentials missing — set GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY in your env.",
      500,
      null,
    );
  }
  return { id, key };
}

export function isConfigured(): boolean {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.access;
  const { id, key } = creds();
  const res = await fetch(`${BASE_URL}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ secret_id: id, secret_key: key }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GoCardlessError(`Token request failed: ${res.status}`, res.status, body);
  }
  const json = (await res.json()) as {
    access: string;
    refresh: string;
    access_expires: number; // seconds
  };
  tokenCache = {
    access: json.access,
    refresh: json.refresh,
    expiresAt: now + json.access_expires * 1000,
  };
  return json.access;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GoCardlessError(
      `${init.method ?? "GET"} ${path} failed: ${res.status}`,
      res.status,
      body,
    );
  }
  return (await res.json()) as T;
}

export async function listInstitutions(country: string): Promise<Institution[]> {
  return call<Institution[]>(`/institutions/?country=${encodeURIComponent(country)}`);
}

export async function getInstitution(id: string): Promise<Institution> {
  return call<Institution>(`/institutions/${id}/`);
}

export async function createRequisition(input: {
  institutionId: string;
  redirect: string;
  reference: string;
  userLanguage?: string;
}): Promise<RequisitionCreated> {
  return call<RequisitionCreated>(`/requisitions/`, {
    method: "POST",
    body: JSON.stringify({
      institution_id: input.institutionId,
      redirect: input.redirect,
      reference: input.reference,
      user_language: input.userLanguage ?? "FR",
    }),
  });
}

export async function getRequisition(id: string): Promise<Requisition> {
  return call<Requisition>(`/requisitions/${id}/`);
}

export async function deleteRequisition(id: string): Promise<void> {
  await call(`/requisitions/${id}/`, { method: "DELETE" });
}

export async function getAccountDetails(accountId: string): Promise<AccountDetails> {
  return call<AccountDetails>(`/accounts/${accountId}/details/`);
}

export async function getAccountBalances(
  accountId: string,
): Promise<{ balances: Balance[] }> {
  return call(`/accounts/${accountId}/balances/`);
}

export async function getAccountTransactions(
  accountId: string,
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<{ transactions: { booked: GcTransaction[]; pending: GcTransaction[] } }> {
  const qs = new URLSearchParams();
  if (opts.dateFrom) qs.set("date_from", opts.dateFrom);
  if (opts.dateTo) qs.set("date_to", opts.dateTo);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return call(`/accounts/${accountId}/transactions/${suffix}`);
}

// Pick the best balance from the array — banks return several types,
// closingBooked or expected is most reliable. Falls back to first.
export function pickPrimaryBalance(balances: Balance[]): Balance | null {
  if (!balances || balances.length === 0) return null;
  const priority = [
    "closingBooked",
    "expected",
    "interimAvailable",
    "interimBooked",
    "openingBooked",
  ];
  for (const t of priority) {
    const found = balances.find((b) => b.balanceType === t);
    if (found) return found;
  }
  return balances[0];
}
