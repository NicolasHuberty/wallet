export type ParsedAmortRow = {
  index: number;
  dueDate: Date;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
};

export type ParseResult = {
  rows: ParsedAmortRow[];
  warnings: string[];
  detectedFormat: "crelan_5col" | "generic_5col" | "fallback" | "none";
};

function parseBE(s: string): number {
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

const NUM = "[-+]?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})|[-+]?\\d+(?:,\\d{1,2})";
const NUM_RE = new RegExp(NUM, "g");

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function parseAmortizationPDFText(text: string, startDate: Date): ParseResult {
  const warnings: string[] = [];
  const rows: ParsedAmortRow[] = [];
  const lines = text.split(/\r?\n/);

  const lineRe = /^\s*(\d{1,3})\s+([\d.,\s]+)\s+([\d.,\s]+)\s+([\d.,\s]+)\s+([\d.,\s]+)\s*$/;

  let lastIndex = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/[a-zA-Z]/.test(t) && !/^\d/.test(t)) continue;

    const m = lineRe.exec(t);
    if (!m) continue;

    const idx = parseInt(m[1], 10);
    const payment = parseBE(m[2]);
    const interest = parseBE(m[3]);
    const principal = parseBE(m[4]);
    const balance = parseBE(m[5]);

    if ([payment, interest, principal, balance].some((n) => isNaN(n))) continue;
    if (idx < 1 || idx > 600) continue;
    if (idx <= lastIndex) continue;

    const diff = Math.abs(payment - (interest + principal));
    if (diff > Math.max(5, payment * 0.05)) continue;

    rows.push({
      index: idx,
      dueDate: addMonths(startDate, idx),
      payment,
      interest,
      principal,
      balance,
    });
    lastIndex = idx;
  }

  if (rows.length === 0) {
    const fallback = parseByNumberExtraction(text, startDate);
    if (fallback.rows.length > 0) return { ...fallback, detectedFormat: "fallback" };
    warnings.push("Aucune ligne exploitable — format non reconnu");
    return { rows, warnings, detectedFormat: "none" };
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].index !== rows[i - 1].index + 1) {
      warnings.push(`Saut dans la numérotation : ${rows[i - 1].index} → ${rows[i].index}`);
    }
  }

  return { rows, warnings, detectedFormat: "crelan_5col" };
}

function parseByNumberExtraction(text: string, startDate: Date): ParseResult {
  const rows: ParsedAmortRow[] = [];
  const lines = text.split(/\r?\n/);
  let lastIndex = 0;

  for (const line of lines) {
    const nums = line.match(NUM_RE);
    const intMatch = line.trim().match(/^(\d{1,3})\b/);
    if (!nums || nums.length < 4 || !intMatch) continue;
    const idx = parseInt(intMatch[1], 10);
    if (idx < 1 || idx > 600 || idx <= lastIndex) continue;

    const parsed = nums.map(parseBE).filter((n) => !isNaN(n));
    if (parsed.length < 4) continue;

    const last4 = parsed.slice(-4);
    const [payment, interest, principal, balance] = last4;
    if (Math.abs(payment - (interest + principal)) > Math.max(5, payment * 0.05)) continue;

    rows.push({
      index: idx,
      dueDate: addMonths(startDate, idx),
      payment,
      interest,
      principal,
      balance,
    });
    lastIndex = idx;
  }

  return { rows, warnings: [], detectedFormat: rows.length > 0 ? "generic_5col" : "none" };
}
