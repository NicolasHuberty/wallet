/**
 * Pure logic for mortgage early-repayment simulation.
 *
 * Given the remaining state of a loan, computes:
 *   - the baseline payoff date (no extra payment)
 *   - the simulated payoff date (with `extraMonthly` euros paid each month in addition)
 *   - months & interest saved
 *   - the complete amortization schedule (simulated timeline), used for charting
 *
 * Math: standard French-style amortization (constant monthly payment, monthly
 * capitalization). Each month:
 *   interest = balance * monthlyRate
 *   principal = min(monthlyPayment + extraMonthly - interest, balance)
 *   balance -= principal
 *
 * Edge cases:
 *   - rate = 0 → interest is zero, monthly principal = monthlyPayment + extra
 *   - extra = 0 → baseline schedule
 *   - already paid off (principalRemaining <= 0) → empty schedule, 0 saved
 *   - payment too small to cover interest → we cap months to monthsRemaining * 2
 *     to avoid infinite loops (the loan would never amortize).
 */

export type Mortgage = {
  /** Outstanding capital at startDate (EUR) */
  principalRemaining: number;
  /** Nominal annual rate, percent (e.g. 3.25 for 3.25 %) */
  annualRate: number;
  /** Months left on the loan at startDate */
  monthsRemaining: number;
  /** Standard monthly payment (capital + interest) */
  monthlyPayment: number;
};

export type ScheduleEntry = {
  /** 1-based month offset from startDate */
  month: number;
  /** Capital amortized this month */
  principal: number;
  /** Interest paid this month */
  interest: number;
  /** Remaining balance AFTER this month's payment */
  balance: number;
};

export type SimulationResult = {
  baselinePayoffDate: Date;
  newPayoffDate: Date;
  /** How many months earlier the loan is paid off (>= 0) */
  monthsSaved: number;
  /** Interest euros saved vs baseline (>= 0) */
  interestSaved: number;
  /** Total interest over the simulated schedule (EUR) */
  totalInterestSimulated: number;
  /** Total interest over the baseline schedule (EUR) */
  totalInterestBaseline: number;
  /** Simulated amortization schedule */
  schedule: ScheduleEntry[];
  /** Baseline amortization schedule (no extra) */
  baselineSchedule: ScheduleEntry[];
};

/** Safety cap so we never loop indefinitely on a degenerate input. */
const MAX_SIM_MONTHS = 1200; // 100 years

/**
 * Adds `months` months to `start`. Uses the 1st of the month to mirror the
 * convention used elsewhere in the app (amortization entries due date).
 */
export function addMonths(start: Date, months: number): Date {
  return new Date(start.getFullYear(), start.getMonth() + months, start.getDate());
}

function runAmortization(
  initialBalance: number,
  monthlyRate: number,
  monthlyPayment: number,
  extraMonthly: number,
  hardCap: number,
): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  let balance = initialBalance;
  const totalPayment = monthlyPayment + Math.max(0, extraMonthly);
  for (let i = 1; i <= hardCap && balance > 0.5; i++) {
    const interest = monthlyRate > 0 ? balance * monthlyRate : 0;
    let principal = totalPayment - interest;
    if (principal <= 0) {
      // Payment doesn't even cover interest — abort to avoid infinite loop.
      // We still record the step (interest only) and bail out.
      out.push({ month: i, principal: 0, interest, balance });
      break;
    }
    if (principal > balance) principal = balance;
    balance = Math.max(0, balance - principal);
    out.push({ month: i, principal, interest, balance });
  }
  return out;
}

function totalInterest(schedule: ScheduleEntry[]): number {
  let s = 0;
  for (const e of schedule) s += e.interest;
  return s;
}

/**
 * Simulates the effect of paying `extraMonthly` EUR on top of the standard
 * monthly payment, starting at `startDate`.
 */
export function simulateExtraPayment(
  m: Mortgage,
  extraMonthly: number,
  startDate: Date,
): SimulationResult {
  const extra = Math.max(0, extraMonthly);
  const monthlyRate = m.annualRate > 0 ? m.annualRate / 100 / 12 : 0;

  // Hard cap on the simulated schedule length. We never need more than the
  // original monthsRemaining (baseline) — the loan amortizes strictly faster.
  // Add a small safety margin for degenerate inputs.
  const hardCap = Math.min(
    MAX_SIM_MONTHS,
    Math.max(1, m.monthsRemaining) * 2,
  );

  if (m.principalRemaining <= 0 || m.monthsRemaining <= 0 || m.monthlyPayment <= 0) {
    const empty: ScheduleEntry[] = [];
    return {
      baselinePayoffDate: startDate,
      newPayoffDate: startDate,
      monthsSaved: 0,
      interestSaved: 0,
      totalInterestBaseline: 0,
      totalInterestSimulated: 0,
      schedule: empty,
      baselineSchedule: empty,
    };
  }

  const baseline = runAmortization(m.principalRemaining, monthlyRate, m.monthlyPayment, 0, hardCap);
  const simulated = extra > 0
    ? runAmortization(m.principalRemaining, monthlyRate, m.monthlyPayment, extra, hardCap)
    : baseline;

  const baselineMonths = baseline.length;
  const simulatedMonths = simulated.length;

  const totalBaseline = totalInterest(baseline);
  const totalSimulated = totalInterest(simulated);

  const baselinePayoffDate = addMonths(startDate, baselineMonths);
  const newPayoffDate = addMonths(startDate, simulatedMonths);

  return {
    baselinePayoffDate,
    newPayoffDate,
    monthsSaved: Math.max(0, baselineMonths - simulatedMonths),
    interestSaved: Math.max(0, totalBaseline - totalSimulated),
    totalInterestBaseline: totalBaseline,
    totalInterestSimulated: totalSimulated,
    schedule: simulated,
    baselineSchedule: baseline,
  };
}
