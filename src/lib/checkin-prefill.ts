import type { AccountKind } from "@/db/schema";
import { isLiability } from "./labels";

/**
 * Pure helpers used to pre-fill the monthly check-in form with sensible
 * estimates, based on the account's last known value (previous month) plus
 * expected DCA contributions / interest / amortisation for the month being
 * updated.
 *
 * The helpers are side-effect free so they can be unit-tested and called
 * safely from both server (page) and client (form) code.
 */

export type AccountLike = {
  id: string;
  kind: AccountKind;
  /** Up-to-date balance stored on the account row. Used as fallback. */
  currentValue: number;
  annualYieldPct: number | null;
  annualAppreciationPct: number | null;
  monthlyContribution: number | null;
  /** Creation date of the account — used to detect mid-month accounts. */
  createdAt?: Date | null;
};

export type PrefillSource = "snapshot" | "current" | "none";

export type AccountPrefill = {
  /** Balance at the end of the previous month (or a fallback). */
  previousValue: number;
  /** Where `previousValue` came from. */
  previousSource: PrefillSource;
  /** Pre-computed "growth" value (monthly compounded interest / appreciation). */
  growth: number;
  /** Pre-computed "contribution" value (DCA or expected principal repayment). */
  contribution: number;
  /** Target balance the form should suggest for the end of the month. */
  expectedValue: number;
  /** True when there is no reliable prior data (first check-in ever). */
  isFirstMonth: boolean;
  /** True when the account was opened after the month being checked-in. */
  isFutureAccount: boolean;
  /** True when a liability has been fully repaid — input can be disabled. */
  isFullyRepaid: boolean;
};

type PrefillInputs = {
  account: AccountLike;
  /** Most recent snapshot ending strictly before `monthStart`. */
  lastSnapshot: { value: number; date: Date } | null;
  /** First day of the month being checked-in, local time. */
  monthStart: Date;
  /**
   * Amortization entry matching `monthStart` (or the next future entry) for
   * liability accounts linked to a mortgage. Supplied by the caller.
   */
  amortization?: { principal: number } | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Monthly rate derived from a compounded annual rate (%). */
export function monthlyRate(annualPct: number | null | undefined): number {
  if (!annualPct) return 0;
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/**
 * Compute a prefill for a single account.
 *
 * Per account kind:
 *  - savings / cash: `expected = last` (DCA added if set, interest added if a
 *    yield is configured).
 *  - brokerage / retirement / crypto: `expected = last × (1 + monthly yield)
 *    + DCA`. The user is expected to override with the actual broker value.
 *  - real_estate: `expected = last × (1 + monthly appreciation)`. No DCA.
 *  - loan / credit_card (liabilities): `expected = last + principal` where
 *    `principal` is the amortisation entry if available, otherwise the
 *    account's monthlyContribution (treated as principal paid).
 *  - other_asset: `expected = last` (no assumption).
 *
 * Edge cases:
 *  - No prior snapshot AND no current value → `isFirstMonth = true`, all
 *    amounts default to 0.
 *  - Account created strictly after `monthStart` → `isFutureAccount = true`,
 *    all amounts 0 (UI can show empty placeholder).
 *  - Liability already at 0 → `isFullyRepaid = true`, prefill 0 (UI can
 *    disable input).
 */
export function computeAccountPrefill({
  account,
  lastSnapshot,
  monthStart,
  amortization,
}: PrefillInputs): AccountPrefill {
  const createdAt = account.createdAt ?? null;
  const isFutureAccount =
    createdAt != null && createdAt.getTime() > monthStart.getTime();

  // Resolve base value + source.
  let previousValue = 0;
  let previousSource: PrefillSource = "none";
  if (lastSnapshot) {
    previousValue = lastSnapshot.value;
    previousSource = "snapshot";
  } else if (!isFutureAccount && account.currentValue !== 0) {
    // Fallback to the live account value: better than nothing for accounts
    // that pre-date snapshot tracking.
    previousValue = account.currentValue;
    previousSource = "current";
  }

  const isFirstMonth = previousSource === "none";

  // Empty prefill for accounts that shouldn't be touched this month.
  if (isFutureAccount || isFirstMonth) {
    return {
      previousValue: 0,
      previousSource,
      growth: 0,
      contribution: 0,
      expectedValue: 0,
      isFirstMonth,
      isFutureAccount,
      isFullyRepaid: false,
    };
  }

  // Liability fully repaid: nothing to update.
  if (isLiability(account.kind) && previousValue === 0) {
    return {
      previousValue: 0,
      previousSource,
      growth: 0,
      contribution: 0,
      expectedValue: 0,
      isFirstMonth: false,
      isFutureAccount: false,
      isFullyRepaid: true,
    };
  }

  const kind = account.kind;
  let growth = 0;
  let contribution = 0;

  if (kind === "real_estate") {
    const rate = monthlyRate(account.annualAppreciationPct);
    growth = Math.max(0, previousValue) * rate;
    contribution = 0;
  } else if (kind === "loan" || kind === "credit_card") {
    // Liability: `previousValue` is negative. "Growth" stays 0.
    // Contribution represents principal paid → reduces |balance|.
    if (amortization && amortization.principal > 0) {
      contribution = amortization.principal;
    } else if (account.monthlyContribution && account.monthlyContribution > 0) {
      contribution = account.monthlyContribution;
    } else {
      contribution = 0;
    }
    // Don't over-pay a liability already close to 0.
    contribution = Math.min(contribution, Math.abs(previousValue));
    growth = 0;
  } else {
    // cash / savings / brokerage / retirement / crypto / other_asset
    const rate = monthlyRate(account.annualYieldPct);
    growth = Math.max(0, previousValue) * rate;
    contribution = account.monthlyContribution ?? 0;
  }

  growth = round2(growth);
  contribution = round2(contribution);

  let expectedValue: number;
  if (isLiability(kind)) {
    // previousValue is negative; principal paid makes it less negative.
    expectedValue = previousValue + contribution;
  } else {
    expectedValue = previousValue + growth + contribution;
  }

  return {
    previousValue: round2(previousValue),
    previousSource,
    growth,
    contribution,
    expectedValue: round2(expectedValue),
    isFirstMonth: false,
    isFutureAccount: false,
    isFullyRepaid: false,
  };
}
