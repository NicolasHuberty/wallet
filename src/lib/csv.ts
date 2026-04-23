export type AmortRow = {
  dueDate: Date;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

function detectSeparator(line: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let max = 0;
  for (const c of candidates) {
    const n = line.split(c).length;
    if (n > max) {
      max = n;
      best = c;
    }
  }
  return best;
}

function parseNumber(s: string): number {
  if (!s) return 0;
  let x = s.trim().replace(/\s/g, "").replace(/€/g, "").replace(/EUR/gi, "");
  const hasComma = x.includes(",");
  const hasDot = x.includes(".");
  if (hasComma && hasDot) {
    if (x.lastIndexOf(",") > x.lastIndexOf(".")) {
      x = x.replace(/\./g, "").replace(",", ".");
    } else {
      x = x.replace(/,/g, "");
    }
  } else if (hasComma) {
    x = x.replace(",", ".");
  }
  const n = parseFloat(x);
  return isNaN(n) ? 0 : n;
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
  const fr = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/;
  let m = iso.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = fr.exec(t);
  if (m) {
    const y = Number(m[3].length === 2 ? (Number(m[3]) < 50 ? "20" + m[3] : "19" + m[3]) : m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[éèê]/g, "e").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

const headerAliases: Record<string, keyof AmortRow> = {
  date: "dueDate",
  echeance: "dueDate",
  date_echeance: "dueDate",
  date_de_valeur: "dueDate",
  due_date: "dueDate",
  payment: "payment",
  mensualite: "payment",
  mensualite_totale: "payment",
  paiement: "payment",
  montant: "payment",
  total: "payment",
  principal: "principal",
  capital: "principal",
  amortissement: "principal",
  capital_amorti: "principal",
  interest: "interest",
  interets: "interest",
  interet: "interest",
  balance: "balance",
  solde: "balance",
  capital_restant: "balance",
  capital_restant_du: "balance",
  restant: "balance",
  solde_restant: "balance",
};

export function parseAmortizationCSV(raw: string): { rows: AmortRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { rows: [], warnings: ["CSV vide"] };

  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], warnings: ["Au moins un en-tête et une ligne requis"] };

  const sep = detectSeparator(lines[0]);
  const header = lines[0].split(sep).map((h) => normalizeHeader(h));

  const mapping: Partial<Record<keyof AmortRow, number>> = {};
  header.forEach((h, i) => {
    const key = headerAliases[h];
    if (key) mapping[key] = i;
  });

  if (mapping.dueDate === undefined) warnings.push("Colonne 'date' non trouvée — vérifiez l'en-tête");
  if (mapping.balance === undefined) warnings.push("Colonne 'solde' non trouvée");

  const rows: AmortRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const dueStr = mapping.dueDate !== undefined ? cols[mapping.dueDate] : "";
    const due = parseDate(dueStr ?? "");
    if (!due) {
      if (i <= 3) warnings.push(`Ligne ${i + 1} : date invalide "${dueStr}"`);
      continue;
    }
    const payment = mapping.payment !== undefined ? parseNumber(cols[mapping.payment] ?? "") : 0;
    const principal = mapping.principal !== undefined ? parseNumber(cols[mapping.principal] ?? "") : 0;
    const interest = mapping.interest !== undefined ? parseNumber(cols[mapping.interest] ?? "") : 0;
    const balance = mapping.balance !== undefined ? parseNumber(cols[mapping.balance] ?? "") : 0;
    rows.push({
      dueDate: due,
      payment: payment || principal + interest,
      principal,
      interest,
      balance,
    });
  }
  if (rows.length === 0) warnings.push("Aucune ligne exploitable");
  return { rows, warnings };
}
