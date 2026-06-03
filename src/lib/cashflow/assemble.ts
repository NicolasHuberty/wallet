import type { FlowFrequency, FlowType, EnvelopeCadence } from "@/db/schema";
import {
  daysInMonth,
  expandOccurrences,
  upcomingOccurrences,
  type DatedFlow,
} from "./occurrences";
import { computePacing, pacingColor, type PacingResult, type PacingColor } from "./pacing";
import { computeSafeToSpend, type SafeToSpendResult } from "./safe-to-spend";

/**
 * Cash-flow ("Cap") — assemblage des lignes du domaine en un view-model de
 * dashboard. Logique PURE (aucun accès DB) : la couche données fetch les rows,
 * cette fonction calcule tout. Entièrement testable.
 */

export type IncomeRow = {
  label: string;
  amount: number;
  dayOfMonth: number | null;
  frequency: FlowFrequency;
  isVariable: boolean;
  floorAmount: number | null;
  startDate: Date;
  endDate: Date | null;
};

export type FixedExpenseRow = {
  label: string;
  amount: number;
  dayOfMonth: number | null;
  frequency: FlowFrequency;
  flowType: FlowType;
  active: boolean;
  startDate: Date;
  endDate: Date | null;
};

export type EnvelopeRow = {
  id: string;
  label: string;
  category: string;
  monthlyAmount: number;
  cadence: EnvelopeCadence;
  occurrencesPerMonth: number | null;
  active: boolean;
};

export type SpendEventRow = {
  amount: number;
  envelopeId: string | null;
  chargedToBuffer: boolean;
};

export type AssembleInput = {
  /** Date courante (sert d'horloge ; UTC). */
  today: Date;
  /** Solde de vie courante réellement accessible. */
  availableBalance: number;
  incomes: IncomeRow[];
  fixedExpenses: FixedExpenseRow[];
  envelopes: EnvelopeRow[];
  spendEvents: SpendEventRow[];
  /** DCA mensualisé + objectif d'épargne forcé (mode "fixed"). */
  committedSavings: number;
  /** Coussin mensuel du profil. */
  bufferAmount: number;
};

export type EnvelopeView = {
  id: string;
  label: string;
  category: string;
  cadence: EnvelopeCadence;
  occurrencesPerMonth: number | null;
  planned: number;
  consumed: number;
  remaining: number;
  pacing: PacingResult;
  color: PacingColor;
};

export type UpcomingItem = {
  day: number;
  date: Date;
  label: string;
  amount: number;
  kind: "income" | "expense";
};

export type CashflowDashboard = {
  month: string; // YYYY-MM
  dayOfMonth: number;
  daysInMonth: number;
  safe: SafeToSpendResult;
  envelopes: EnvelopeView[];
  upcoming: UpcomingItem[];
  plannedIncome: number;
  plannedFixed: number;
  plannedVariable: number;
  bufferRemaining: number;
  bufferAmount: number;
};

/** Montant effectif d'un revenu : plancher si variable. */
function effectiveIncome(i: IncomeRow): number {
  return i.isVariable ? i.floorAmount ?? i.amount : i.amount;
}

function incomeFlow(i: IncomeRow): DatedFlow {
  return {
    amount: effectiveIncome(i),
    dayOfMonth: i.dayOfMonth,
    frequency: i.frequency,
    anchorDate: i.startDate,
    endDate: i.endDate,
    active: true,
  };
}

function fixedFlow(e: FixedExpenseRow): DatedFlow {
  return {
    amount: e.amount,
    dayOfMonth: e.dayOfMonth,
    frequency: e.frequency,
    anchorDate: e.startDate,
    endDate: e.endDate,
    active: e.active,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function assembleDashboard(input: AssembleInput): CashflowDashboard {
  const year = input.today.getUTCFullYear();
  const month0 = input.today.getUTCMonth();
  const day = input.today.getUTCDate();
  const dim = daysInMonth(year, month0);
  const month = `${year}-${pad2(month0 + 1)}`;

  // ── Revenus ────────────────────────────────────────────────────────
  let plannedIncome = 0;
  let remainingIncome = 0;
  const upcoming: UpcomingItem[] = [];
  for (const i of input.incomes) {
    const flow = incomeFlow(i);
    for (const o of expandOccurrences(flow, year, month0)) {
      plannedIncome += o.amount;
    }
    for (const o of upcomingOccurrences(flow, year, month0, day)) {
      remainingIncome += o.amount;
      upcoming.push({ day: o.day, date: o.date, label: i.label, amount: o.amount, kind: "income" });
    }
  }

  // ── Fixes datés ────────────────────────────────────────────────────
  let plannedFixed = 0;
  let remainingFixed = 0;
  for (const e of input.fixedExpenses) {
    if (e.flowType !== "fixed" || e.active === false) continue;
    const flow = fixedFlow(e);
    for (const o of expandOccurrences(flow, year, month0)) {
      plannedFixed += o.amount;
    }
    for (const o of upcomingOccurrences(flow, year, month0, day)) {
      remainingFixed += o.amount;
      upcoming.push({ day: o.day, date: o.date, label: e.label, amount: o.amount, kind: "expense" });
    }
  }
  upcoming.sort((a, b) => a.day - b.day);

  // ── Consommation par enveloppe ─────────────────────────────────────
  const consumedByEnvelope = new Map<string, number>();
  let bufferConsumed = 0;
  for (const s of input.spendEvents) {
    if (s.chargedToBuffer || s.envelopeId === null) {
      bufferConsumed += s.amount;
    } else {
      consumedByEnvelope.set(s.envelopeId, (consumedByEnvelope.get(s.envelopeId) ?? 0) + s.amount);
    }
  }

  let plannedVariable = 0;
  let variableRemaining = 0;
  let discretionaryConsumed = 0;
  const envelopes: EnvelopeView[] = [];
  for (const env of input.envelopes) {
    if (env.active === false) continue;
    const planned = env.monthlyAmount;
    const consumed = consumedByEnvelope.get(env.id) ?? 0;
    const remaining = Math.max(0, planned - consumed);
    plannedVariable += planned;
    variableRemaining += remaining;
    discretionaryConsumed += consumed;
    const pacing = computePacing({ planned, consumed, day, totalDays: dim });
    envelopes.push({
      id: env.id,
      label: env.label,
      category: env.category,
      cadence: env.cadence,
      occurrencesPerMonth: env.occurrencesPerMonth,
      planned,
      consumed,
      remaining,
      pacing,
      color: pacingColor(pacing.state),
    });
  }

  const bufferRemaining = Math.max(0, input.bufferAmount - bufferConsumed);
  discretionaryConsumed += bufferConsumed;
  const discretionaryPlanned = plannedVariable + input.bufferAmount;

  const safe = computeSafeToSpend({
    availableBalance: input.availableBalance,
    remainingIncome,
    remainingFixed,
    variableRemaining,
    committedSavings: input.committedSavings,
    bufferRemaining,
    dayOfMonth: day,
    daysInMonth: dim,
    discretionaryPlanned,
    discretionaryConsumed,
  });

  return {
    month,
    dayOfMonth: day,
    daysInMonth: dim,
    safe,
    envelopes,
    upcoming,
    plannedIncome,
    plannedFixed,
    plannedVariable,
    bufferRemaining,
    bufferAmount: input.bufferAmount,
  };
}
