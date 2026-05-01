// Rule-based transaction categoriser, tuned for Belgian retail banking
// (BNP Fortis, Belfius, KBC, ING, Crelan, Argenta, Beobank, Revolut Bank).
// The categoriser inspects the transaction's description (creditorName /
// debtorName / remittanceInformation, concatenated into `notes` at sync
// time) and the amount sign to assign one of the categories below.
//
// Rules are intentionally simple — keyword matches with priority ordering.
// First match wins. Anything unmatched falls back to a sensible default
// based on the sign (income / expense / transfer).
//
// Add new keywords here without changing the call-site contract.

export const transactionCategory = [
  "income_salary",
  "income_other",
  "housing",
  "utilities",
  "telecom_internet",
  "food_groceries",
  "food_restaurant",
  "transport",
  "subscriptions",
  "health",
  "leisure",
  "shopping",
  "education",
  "insurance",
  "fees_bank",
  "tax",
  "cash_withdrawal",
  "transfer_internal",
  "savings_invest",
  "donation_gift",
  "other_expense",
  "other",
] as const;
export type TransactionCategory = (typeof transactionCategory)[number];

export const categoryLabel: Record<TransactionCategory, string> = {
  income_salary: "Salaire",
  income_other: "Autres revenus",
  housing: "Logement",
  utilities: "Énergie & eau",
  telecom_internet: "Télécom & internet",
  food_groceries: "Courses",
  food_restaurant: "Restaurant",
  transport: "Transport",
  subscriptions: "Abonnements",
  health: "Santé",
  leisure: "Loisirs",
  shopping: "Shopping",
  education: "Éducation",
  insurance: "Assurances",
  fees_bank: "Frais bancaires",
  tax: "Impôts & taxes",
  cash_withdrawal: "Retrait cash",
  transfer_internal: "Virement interne",
  savings_invest: "Épargne / invest",
  donation_gift: "Dons & cadeaux",
  other_expense: "Autres dépenses",
  other: "Autre",
};

export const categoryColor: Record<TransactionCategory, string> = {
  income_salary: "var(--color-success)",
  income_other: "#22c55e",
  housing: "#a855f7",
  utilities: "#eab308",
  telecom_internet: "#06b6d4",
  food_groceries: "#10b981",
  food_restaurant: "#f97316",
  transport: "#3b82f6",
  subscriptions: "#ec4899",
  health: "#ef4444",
  leisure: "#8b5cf6",
  shopping: "#f59e0b",
  education: "#0ea5e9",
  insurance: "#6366f1",
  fees_bank: "#dc2626",
  tax: "#7c2d12",
  cash_withdrawal: "#64748b",
  transfer_internal: "#94a3b8",
  savings_invest: "#0d9488",
  donation_gift: "#d946ef",
  other_expense: "#9ca3af",
  other: "#9ca3af",
};

// Each rule: list of lowercased substrings that match anywhere in the
// description. Order matters: first match wins. Highly-specific names
// before broader keywords (e.g. "amazon prime" before "amazon").
type Rule = { category: TransactionCategory; keywords: string[]; minSign?: "in" | "out" };

const RULES: Rule[] = [
  // ─── Income (only when amount > 0) ──────────────────────────────
  {
    category: "income_salary",
    minSign: "in",
    keywords: [
      "uclouvain",
      "ucl ",
      "salaire",
      "salary",
      "wage",
      "payroll",
      "rémunération",
      "treatment officer",
      "fonction publique",
      "ucl louvain",
    ],
  },
  {
    category: "income_other",
    minSign: "in",
    keywords: [
      "remboursement",
      "refund",
      "cashback",
      "freelance",
      "honoraire",
      "vente",
      "indemnité",
      "alloc",
      "pension",
      "tax refund",
      "famille",
    ],
  },

  // ─── Housing (rent, mortgage payments) ──────────────────────────
  {
    category: "housing",
    keywords: [
      "loyer",
      "rent",
      "syndic",
      "co-propriété",
      "copro",
      "agence immobilière",
      "ag.imm",
      "huur",
      "bnp paribas pret",
      "credit hypothecaire",
      "prêt hypothécaire",
      "remboursement pret",
      "mortgage",
    ],
  },

  // ─── Utilities (energy, water) ──────────────────────────────────
  {
    category: "utilities",
    keywords: [
      "engie",
      "electrabel",
      "luminus",
      "totalenergies",
      "eneco",
      "octa+",
      "octa plus",
      "mega energy",
      "lampiris",
      "vivaqua",
      "swde",
      "in bw",
      "intercommunale",
      "ores",
      "fluvius",
      "sibelga",
    ],
  },

  // ─── Telecom & internet ─────────────────────────────────────────
  {
    category: "telecom_internet",
    keywords: [
      "proximus",
      "orange be",
      "orange belgium",
      "telenet",
      "voo",
      "scarlet",
      "mobile vikings",
      "base ",
      "vodafone",
      "edpnet",
      "hey!",
      "youfone",
    ],
  },

  // ─── Streaming / SaaS / subscriptions ───────────────────────────
  {
    category: "subscriptions",
    keywords: [
      "netflix",
      "spotify",
      "disney+",
      "disneyplus",
      "amazon prime",
      "prime video",
      "apple.com",
      "icloud",
      "apple music",
      "youtube premium",
      "youtube music",
      "crunchyroll",
      "audible",
      "deezer",
      "github",
      "openai",
      "anthropic",
      "claude.ai",
      "vercel",
      "cloudflare",
      "notion.so",
      "linear.app",
      "chatgpt",
      "midjourney",
      "1password",
      "lastpass",
      "dropbox",
      "adobe",
      "canva",
      "figma",
      "patreon",
      "twitch",
      "duolingo",
      "strava",
    ],
  },

  // ─── Food: restaurant / takeaway ───────────────────────────────
  {
    category: "food_restaurant",
    keywords: [
      "restaurant",
      "rest.",
      "brasserie",
      "taverne",
      "bistro",
      "deliveroo",
      "uber eats",
      "ubereats",
      "takeaway",
      "just eat",
      "lieferando",
      "pizza",
      "kebab",
      "sushi",
      "burger king",
      "mcdonald",
      "kfc",
      "quick",
      "domino",
      "exki",
      "panos",
      "le pain quotidien",
      "starbucks",
      "snack",
      "frituur",
      "friterie",
      "cafétéria",
    ],
  },

  // ─── Food: groceries (Belgian-heavy list) ──────────────────────
  {
    category: "food_groceries",
    keywords: [
      "delhaize",
      "ad delhaize",
      "carrefour",
      "carrefour express",
      "carrefour market",
      "colruyt",
      "lidl",
      "aldi",
      "okay",
      "spar",
      "albert heijn",
      "ah ",
      "match ",
      "smatch",
      "intermarche",
      "cora ",
      "dis ",
      "louis delhaize",
      "biocoop",
      "the barn",
      "marche",
      "boulangerie",
      "boucherie",
      "epicerie",
      "nightshop",
    ],
  },

  // ─── Transport ──────────────────────────────────────────────────
  {
    category: "transport",
    keywords: [
      "stib",
      "mivb",
      "tec ",
      "de lijn",
      "delijn",
      "sncb",
      "nmbs",
      "thalys",
      "eurostar",
      "shell ",
      "esso",
      "total fina",
      "totalenergies station",
      "q8 ",
      "lukoil",
      "octa+",
      "tesla supercharger",
      "ionity",
      "uber",
      "bolt",
      "heetch",
      "cambio",
      "billy bike",
      "lime",
      "voi",
      "tier",
      "bird",
      "parking",
      "interparking",
      "qpark",
      "be-mobile",
      "viapass",
      "péage",
      "autoroute",
      "vinci autoroute",
    ],
  },

  // ─── Health ─────────────────────────────────────────────────────
  {
    category: "health",
    keywords: [
      "pharmacie",
      "pharma",
      "apotheek",
      "mutualité",
      "mutualités",
      "mutualité chrétienne",
      "partenamut",
      "solidaris",
      "neutre",
      "cm ",
      "mloz",
      "hopital",
      "hôpital",
      "hospital",
      "clinique",
      "médecin",
      "dentiste",
      "kine",
      "kinésithérapeute",
      "ophtalmologie",
      "psychologue",
      "labo ",
      "laboratoire",
      "ucl saint-luc",
      "uz brussel",
    ],
  },

  // ─── Insurance ──────────────────────────────────────────────────
  {
    category: "insurance",
    keywords: [
      "axa",
      "ag insurance",
      "ag.assur",
      "ethias",
      "p&v",
      "baloise",
      "allianz",
      "dkv",
      "argenta assur",
      "belfius assur",
      "fidea",
      "vivium",
      "assurance",
      "assur ",
      "verzeker",
    ],
  },

  // ─── Education ──────────────────────────────────────────────────
  {
    category: "education",
    keywords: [
      "inscription",
      "minerval",
      "frais d'inscription",
      "université",
      "ecole",
      "école",
      "school",
      "kuleuven",
      "ulb",
      "uliege",
      "uantwerp",
      "vub",
      "haute ecole",
      "udemy",
      "coursera",
      "edx",
      "skillshare",
    ],
  },

  // ─── Leisure ────────────────────────────────────────────────────
  {
    category: "leisure",
    keywords: [
      "cinema",
      "kinepolis",
      "ugc",
      "pathé",
      "cinepolis",
      "concert",
      "ticket",
      "ticketmaster",
      "billeterie",
      "musée",
      "museum",
      "festival",
      "tomorrowland",
      "rock werchter",
      "spotify concert",
      "decathlon",
      "basic-fit",
      "basicfit",
      "basic fit",
      "fitness",
      "salle de sport",
      "pool",
      "piscine",
      "bowling",
      "escape room",
      "airbnb",
      "booking.com",
      "hotel",
      "ryanair",
      "brussels airlines",
      "tui",
      "thomas cook",
      "neckermann",
    ],
  },

  // ─── Shopping (clothing / general) ──────────────────────────────
  {
    category: "shopping",
    keywords: [
      "amazon",
      "amzn",
      "zalando",
      "zara",
      "h&m",
      "uniqlo",
      "primark",
      "c&a",
      "veepee",
      "shein",
      "ali express",
      "aliexpress",
      "ikea",
      "fnac",
      "vandenborre",
      "media markt",
      "krëfel",
      "krefel",
      "hubo",
      "brico",
      "leroy merlin",
      "action ",
      "wibra",
      "blokker",
      "kruidvat",
      "ici paris",
      "sephora",
      "yves rocher",
      "paypal",
    ],
  },

  // ─── Cash withdrawal ────────────────────────────────────────────
  {
    category: "cash_withdrawal",
    keywords: [
      "atm",
      "geldopname",
      "retrait",
      "retrait dab",
      "withdrawal",
      "cash withdrawal",
      "self ",
      "bancontact retrait",
    ],
  },

  // ─── Bank fees ──────────────────────────────────────────────────
  {
    category: "fees_bank",
    keywords: [
      "frais",
      "commission",
      "cotisation carte",
      "cotisation annuelle",
      "frais de tenue",
      "robo management fee",
      "negative balance",
      "interest charge",
      "agio",
      "frais bancaires",
    ],
  },

  // ─── Tax ────────────────────────────────────────────────────────
  {
    category: "tax",
    keywords: [
      "spf finances",
      "fod financien",
      "spf fin",
      "tva ",
      "ipp ",
      "précompte",
      "voorheffing",
      "taxes communales",
      "taxe annuelle",
      "tax administration",
      "ondernemingsnummer",
      "douane",
    ],
  },

  // ─── Internal transfers ─────────────────────────────────────────
  {
    category: "transfer_internal",
    keywords: [
      "virement interne",
      "virement vers compte",
      "transfer to own account",
      "vers compte epargne",
      "vers epargne",
      "from savings",
      "to savings",
      "account transfer",
      "interne overschrijving",
    ],
  },

  // ─── Savings / investments ──────────────────────────────────────
  {
    category: "savings_invest",
    keywords: [
      "revolut",
      "trade republic",
      "degiro",
      "saxo",
      "easyvest",
      "keytrade",
      "boursorama",
      "n26",
      "binance",
      "coinbase",
      "kraken",
      "bitstamp",
      "investment",
      "etf",
      "fonds ",
    ],
  },

  // ─── Donations / gifts ──────────────────────────────────────────
  {
    category: "donation_gift",
    keywords: [
      "don ",
      "donation",
      "msf",
      "médecins sans frontières",
      "croix-rouge",
      "rode kruis",
      "amnesty",
      "wwf",
      "unicef",
      "oxfam",
      "telethon",
      "cap48",
    ],
  },
];

export type ClassifyInput = {
  amount: number;
  notes?: string | null;
  // For pre-typed cashflows (eg. dividend / fee already known) we honour the
  // existing kind when possible.
  existingKind?:
    | "deposit"
    | "withdrawal"
    | "dividend"
    | "fee"
    | "interest"
    | "buy"
    | "sell"
    | "transfer_in"
    | "transfer_out"
    | "other";
};

export function classifyTransaction(input: ClassifyInput): TransactionCategory {
  const desc = (input.notes ?? "").toLowerCase();
  const sign: "in" | "out" = input.amount >= 0 ? "in" : "out";

  // Honour explicit known kinds as a hard short-circuit
  if (input.existingKind === "dividend") return "income_other";
  if (input.existingKind === "interest") return "income_other";
  if (input.existingKind === "fee") return "fees_bank";

  if (!desc) {
    return sign === "in" ? "income_other" : "other_expense";
  }

  for (const rule of RULES) {
    if (rule.minSign && rule.minSign !== sign) continue;
    for (const k of rule.keywords) {
      if (desc.includes(k)) return rule.category;
    }
  }

  // Fallbacks based on sign
  return sign === "in" ? "income_other" : "other_expense";
}

// Helper: classify a list and produce per-category aggregates.
export function summariseByCategory(
  rows: Array<{ amount: number; notes?: string | null; existingKind?: ClassifyInput["existingKind"] }>,
): Record<TransactionCategory, { total: number; count: number }> {
  const out = {} as Record<TransactionCategory, { total: number; count: number }>;
  for (const c of transactionCategory) out[c] = { total: 0, count: 0 };
  for (const r of rows) {
    const c = classifyTransaction(r);
    out[c].total += r.amount;
    out[c].count++;
  }
  return out;
}
