import type { AccountKind } from "@/db/schema";

export const accountKindLabel: Record<AccountKind, string> = {
  cash: "Compte courant",
  savings: "Épargne",
  brokerage: "Portefeuille-titres",
  retirement: "Pension / Épargne-pension",
  real_estate: "Bien immobilier",
  loan: "Prêt / Crédit",
  credit_card: "Carte de crédit",
  crypto: "Crypto",
  other_asset: "Autre actif",
};

export const accountKindColor: Record<AccountKind, string> = {
  cash: "var(--chart-2)",
  savings: "var(--chart-2)",
  brokerage: "var(--chart-1)",
  retirement: "var(--chart-1)",
  real_estate: "var(--chart-3)",
  loan: "var(--destructive)",
  credit_card: "var(--destructive)",
  crypto: "var(--chart-4)",
  other_asset: "var(--chart-5)",
};

export const liabilityKinds: AccountKind[] = ["loan", "credit_card"];

export function isLiability(kind: AccountKind) {
  return liabilityKinds.includes(kind);
}

export const expenseCategoryLabel: Record<string, string> = {
  housing: "Logement",
  utilities: "Énergie & eau",
  food: "Alimentation",
  transport: "Transport",
  insurance: "Assurances",
  subscriptions: "Abonnements",
  leisure: "Loisirs",
  health: "Santé",
  childcare: "Enfants",
  taxes: "Impôts",
  other: "Autre",
};

export const incomeCategoryLabel: Record<string, string> = {
  salary: "Salaire",
  freelance: "Freelance",
  dividends: "Dividendes",
  rent: "Loyer perçu",
  other: "Autre",
};

export const oneOffIncomeCategoryLabel: Record<string, string> = {
  bonus: "Prime / bonus",
  freelance: "Freelance ponctuel",
  gift: "Cadeau",
  refund: "Remboursement",
  tax_refund: "Restitution fiscale",
  dividend: "Dividende",
  sale: "Vente",
  inheritance: "Héritage",
  other: "Autre",
};

export const dcaFrequencyLabel: Record<string, string> = {
  weekly: "Hebdo",
  biweekly: "Bi-mensuel",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
};

export const chargeCategoryLabel: Record<string, string> = {
  notary: "Frais de notaire",
  registration_tax: "Droits d'enregistrement",
  credit_fees: "Frais de dossier crédit",
  expertise: "Frais d'expertise",
  mortgage_insurance: "Assurance solde restant dû",
  renovation: "Travaux / rénovation",
  furniture: "Mobilier & équipement",
  moving: "Déménagement",
  inheritance_tax: "Droits de succession",
  legal: "Frais juridiques",
  tax: "Impôt exceptionnel",
  other: "Autre",
};

export const chargeCategoryColor: Record<string, string> = {
  notary: "var(--chart-3)",
  registration_tax: "var(--chart-3)",
  credit_fees: "var(--chart-5)",
  expertise: "var(--chart-5)",
  mortgage_insurance: "var(--chart-5)",
  renovation: "var(--chart-4)",
  furniture: "var(--chart-4)",
  moving: "var(--chart-2)",
  inheritance_tax: "var(--destructive)",
  legal: "var(--chart-2)",
  tax: "var(--destructive)",
  other: "var(--muted-foreground)",
};

/**
 * Resolve a category identifier (preset enum value or user-entered string)
 * to its human label. Falls back to the raw value for custom categories.
 */
export function resolveCategoryLabel(
  value: string,
  presets: Record<string, string>
): string {
  return presets[value] ?? value;
}

/**
 * Deterministic color for a category string. Uses presets when known,
 * otherwise hashes the string to pick one of the chart palette values.
 */
const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
export function resolveCategoryColor(
  value: string,
  presets: Record<string, string>
): string {
  if (presets[value]) return presets[value];
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return CHART_PALETTE[Math.abs(h) % CHART_PALETTE.length];
}
