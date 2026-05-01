// Parser pour l'export CSV Revolut "Investment statement" / "Tax report".
// Supporte les deux sections rencontrées :
//   - "Income from Sells" (header: Date acquired,Date sold,Symbol,Security name,ISIN,...)
//   - "Other income & fees" (header: Date,Symbol,Security name,ISIN,Country,Gross amount,...)
// Et, par extension, des exports avec section "Positions" / "Holdings" si Revolut les fournit.

export type RevolutEtf = {
  symbol: string;
  name: string;
  isin: string;
  currency: string;
  // Net position si déductible (buy - sell), sinon 0.
  quantitySold: number;
  dividends: number;
};

export type RevolutImportResult = {
  etfs: RevolutEtf[];
  totalDividends: number;
  warnings: string[];
  detectedSections: string[];
};

function splitCsvLine(line: string): string[] {
  // Gère les guillemets autour des champs contenant des virgules.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseNum(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[€$£]/g, "")
    .replace(/EUR|USD|GBP/gi, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

type Section = { title: string; header: string[]; rows: string[][] };

function splitSections(raw: string): Section[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    // Skip blank lines
    while (cursor < lines.length && lines[cursor].trim() === "") cursor++;
    if (cursor >= lines.length) break;

    const titleLine = lines[cursor].trim();
    cursor++;
    // Next non-empty is the header
    while (cursor < lines.length && lines[cursor].trim() === "") cursor++;
    if (cursor >= lines.length) break;

    const headerCols = splitCsvLine(lines[cursor]);
    cursor++;

    const rows: string[][] = [];
    while (cursor < lines.length && lines[cursor].trim() !== "") {
      const row = splitCsvLine(lines[cursor]);
      // Heuristic: if row has only 1 non-empty column, it's likely a new section title.
      const nonEmpty = row.filter((c) => c !== "").length;
      if (nonEmpty <= 1 && row.length <= 3) break;
      rows.push(row);
      cursor++;
    }

    sections.push({ title: titleLine, header: headerCols, rows });
  }
  return sections;
}

export function parseRevolutCsv(raw: string): RevolutImportResult {
  const warnings: string[] = [];
  const detectedSections: string[] = [];
  const byIsin = new Map<string, RevolutEtf>();

  if (!raw || !raw.trim()) {
    return { etfs: [], totalDividends: 0, warnings: ["Fichier vide"], detectedSections };
  }

  const sections = splitSections(raw);
  if (sections.length === 0) {
    warnings.push("Aucune section détectée — format inattendu");
  }

  let totalDividends = 0;

  for (const section of sections) {
    detectedSections.push(section.title);
    const hmap: Record<string, number> = {};
    section.header.forEach((h, i) => (hmap[normalizeHeader(h)] = i));

    const titleLower = section.title.toLowerCase();

    const col = (keys: string[]): number | undefined => {
      for (const k of keys) if (hmap[k] !== undefined) return hmap[k];
      return undefined;
    };

    const symbolIdx = col(["symbol", "ticker"]);
    const nameIdx = col(["security_name", "name", "description"]);
    const isinIdx = col(["isin"]);
    const currencyIdx = col(["currency"]);
    const qtyIdx = col(["quantity", "shares"]);
    const grossAmountIdx = col(["gross_amount", "amount", "net_amount"]);

    // Sells section
    if (titleLower.includes("sell")) {
      if (symbolIdx === undefined || isinIdx === undefined) {
        warnings.push(`Section "${section.title}" : colonnes symbol/ISIN manquantes`);
        continue;
      }
      for (const r of section.rows) {
        const symbol = (r[symbolIdx] ?? "").trim();
        const isin = (r[isinIdx] ?? "").trim();
        if (!symbol || !isin) continue;
        const name = decodeEntities(nameIdx !== undefined ? r[nameIdx] ?? "" : "");
        const currency = currencyIdx !== undefined ? (r[currencyIdx] ?? "EUR").trim() || "EUR" : "EUR";
        const qty = qtyIdx !== undefined ? parseNum(r[qtyIdx]) : 0;
        const existing = byIsin.get(isin);
        if (existing) {
          existing.quantitySold += qty;
          if (!existing.name && name) existing.name = name;
        } else {
          byIsin.set(isin, {
            symbol,
            name,
            isin,
            currency,
            quantitySold: qty,
            dividends: 0,
          });
        }
      }
      continue;
    }

    // Dividends / other income & fees
    if (
      titleLower.includes("dividend") ||
      titleLower.includes("other income") ||
      titleLower.includes("income") ||
      titleLower.includes("fee")
    ) {
      if (isinIdx === undefined) {
        warnings.push(`Section "${section.title}" : colonne ISIN manquante`);
        continue;
      }
      for (const r of section.rows) {
        const isin = (r[isinIdx] ?? "").trim();
        if (!isin) continue;
        const symbol = symbolIdx !== undefined ? (r[symbolIdx] ?? "").trim() : "";
        const name = decodeEntities(nameIdx !== undefined ? r[nameIdx] ?? "" : "");
        const currency =
          currencyIdx !== undefined ? (r[currencyIdx] ?? "EUR").trim() || "EUR" : "EUR";
        const gross = grossAmountIdx !== undefined ? parseNum(r[grossAmountIdx]) : 0;
        totalDividends += gross;
        const existing = byIsin.get(isin);
        if (existing) {
          existing.dividends += gross;
        } else if (symbol) {
          byIsin.set(isin, {
            symbol,
            name,
            isin,
            currency,
            quantitySold: 0,
            dividends: gross,
          });
        }
      }
      continue;
    }

    // Transactions / Activity sections : colonnes Date, Symbol, Type (BUY/SELL), Quantity, Price…
    const typeIdx = col(["type", "transaction_type", "action", "activity_type", "direction"]);
    if (
      typeIdx !== undefined &&
      symbolIdx !== undefined &&
      qtyIdx !== undefined &&
      (titleLower.includes("transaction") ||
        titleLower.includes("activity") ||
        titleLower.includes("trade") ||
        titleLower.includes("order"))
    ) {
      const priceIdx = col(["price", "price_per_share", "unit_price"]);
      for (const r of section.rows) {
        const symbol = (r[symbolIdx] ?? "").trim();
        if (!symbol) continue;
        const isin = isinIdx !== undefined ? (r[isinIdx] ?? "").trim() : symbol;
        const action = (r[typeIdx] ?? "").toLowerCase();
        const qty = parseNum(r[qtyIdx]);
        const price = priceIdx !== undefined ? parseNum(r[priceIdx]) : 0;
        const name = decodeEntities(nameIdx !== undefined ? r[nameIdx] ?? "" : "");
        const currency =
          currencyIdx !== undefined ? (r[currencyIdx] ?? "EUR").trim() || "EUR" : "EUR";

        if (!isin || qty === 0) continue;

        const existing = byIsin.get(isin) ?? {
          symbol,
          name,
          isin,
          currency,
          quantitySold: 0,
          dividends: 0,
        };
        if (!existing.name && name) existing.name = name;

        // Convention : quantitySold négatif = position détenue, positif = net sorti.
        // BUY augmente la position (donc diminue quantitySold), SELL l'inverse.
        if (action.includes("buy") || action.includes("achat")) {
          existing.quantitySold -= qty;
        } else if (action.includes("sell") || action.includes("vente")) {
          existing.quantitySold += qty;
        } else if (action.includes("div")) {
          existing.dividends += price * qty || parseNum(r[grossAmountIdx ?? -1] ?? "");
        }
        byIsin.set(isin, existing);
      }
      continue;
    }

    // Positions / Holdings sections (best effort if Revolut adds them)
    if (titleLower.includes("position") || titleLower.includes("holding")) {
      if (symbolIdx === undefined) continue;
      const priceIdx = col(["price", "last_price", "market_price"]);
      const valueIdx = col(["market_value", "value"]);
      for (const r of section.rows) {
        const symbol = (r[symbolIdx] ?? "").trim();
        const isin = isinIdx !== undefined ? (r[isinIdx] ?? "").trim() : symbol;
        if (!symbol || !isin) continue;
        const name = decodeEntities(nameIdx !== undefined ? r[nameIdx] ?? "" : "");
        const currency =
          currencyIdx !== undefined ? (r[currencyIdx] ?? "EUR").trim() || "EUR" : "EUR";
        const qty = qtyIdx !== undefined ? parseNum(r[qtyIdx]) : 0;
        const price = priceIdx !== undefined ? parseNum(r[priceIdx]) : 0;
        const value = valueIdx !== undefined ? parseNum(r[valueIdx]) : qty * price;
        const existing = byIsin.get(isin);
        if (existing) {
          if (!existing.name && name) existing.name = name;
          // On marque la quantité "vendue" comme négative pour rappeler que c'est une position détenue.
          existing.quantitySold -= qty;
        } else {
          byIsin.set(isin, {
            symbol,
            name,
            isin,
            currency,
            quantitySold: -qty,
            dividends: 0,
          });
        }
        void value;
      }
    }
  }

  const etfs = Array.from(byIsin.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));

  if (etfs.length === 0 && warnings.length === 0) {
    warnings.push(
      "Aucun ETF identifié. Assurez-vous d'avoir exporté le rapport fiscal ou le relevé de compte Revolut."
    );
  }

  return { etfs, totalDividends, warnings, detectedSections };
}

// ─────────────────────────────────────────────────────────────────────
// Flat investment transaction statement
// Header: Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate
// Types: BUY - MARKET, SELL - MARKET, DIVIDEND, CASH TOP-UP, CASH WITHDRAWAL,
//        ROBO MANAGEMENT FEE
// ─────────────────────────────────────────────────────────────────────

export type RevolutInvestmentHolding = {
  ticker: string;
  currency: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
  realizedPnl: number;
  totalDividends: number;
  lastPrice: number;
  buys: number;
  sells: number;
};

export type RevolutInvestmentSnapshot = {
  date: string; // YYYY-MM-DD
  value: number; // cash + position value
  cash: number;
  positionValue: number;
};

export type RevolutCashflowKind =
  | "deposit"
  | "withdrawal"
  | "dividend"
  | "fee"
  | "buy"
  | "sell";

export type RevolutInvestmentEvent = {
  date: Date;
  kind: RevolutCashflowKind;
  amount: number; // signed: + = cash in, - = cash out
  ticker?: string;
  quantity?: number;
  price?: number;
  currency: string;
};

export type RevolutInvestmentResult = {
  format: "investment-transactions";
  holdings: RevolutInvestmentHolding[];
  snapshots: RevolutInvestmentSnapshot[];
  events: RevolutInvestmentEvent[];
  totals: {
    contributions: number;
    withdrawals: number;
    dividends: number;
    fees: number;
    buys: number;
    sells: number;
    finalCash: number;
    finalPositionValue: number;
    finalValue: number;
    eventCount: number;
  };
  warnings: string[];
};

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isInvestmentTransactionsHeader(headerCols: string[]): boolean {
  const norm = headerCols.map((c) => normalizeHeader(c));
  return (
    norm.includes("date") &&
    norm.includes("ticker") &&
    norm.includes("type") &&
    norm.includes("quantity") &&
    (norm.includes("price_per_share") || norm.includes("price")) &&
    norm.includes("total_amount")
  );
}

export function parseRevolutInvestmentCsv(raw: string): RevolutInvestmentResult {
  const warnings: string[] = [];
  const empty: RevolutInvestmentResult = {
    format: "investment-transactions",
    holdings: [],
    snapshots: [],
    events: [],
    totals: {
      contributions: 0,
      withdrawals: 0,
      dividends: 0,
      fees: 0,
      buys: 0,
      sells: 0,
      finalCash: 0,
      finalPositionValue: 0,
      finalValue: 0,
      eventCount: 0,
    },
    warnings,
  };

  if (!raw || !raw.trim()) {
    warnings.push("Fichier vide");
    return empty;
  }

  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    warnings.push("Fichier vide");
    return empty;
  }

  const headerCols = splitCsvLine(lines[0]);
  if (!isInvestmentTransactionsHeader(headerCols)) {
    warnings.push("Format inattendu : en-tête de transactions non reconnu");
    return empty;
  }
  const hmap: Record<string, number> = {};
  headerCols.forEach((h, i) => (hmap[normalizeHeader(h)] = i));
  const idx = (k: string): number | undefined => (hmap[k] !== undefined ? hmap[k] : undefined);

  const dateIdx = idx("date")!;
  const tickerIdx = idx("ticker")!;
  const typeIdx = idx("type")!;
  const qtyIdx = idx("quantity")!;
  const priceIdx = idx("price_per_share") ?? idx("price")!;
  const amountIdx = idx("total_amount")!;
  const currencyIdx = idx("currency");

  type Event = {
    date: Date;
    ticker: string;
    kind: "BUY" | "SELL" | "DIVIDEND" | "TOP_UP" | "WITHDRAWAL" | "FEE" | "OTHER";
    quantity: number;
    price: number;
    amount: number;
    currency: string;
  };

  const events: Event[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 3) continue;

    const dateStr = cols[dateIdx] ?? "";
    const ticker = (cols[tickerIdx] ?? "").trim();
    const typeRaw = (cols[typeIdx] ?? "").toUpperCase();
    const quantity = parseNum(cols[qtyIdx] ?? "");
    const price = parseNum(cols[priceIdx] ?? "");
    const amount = parseNum(cols[amountIdx] ?? "");
    const currency =
      currencyIdx !== undefined ? (cols[currencyIdx] ?? "EUR").trim() || "EUR" : "EUR";

    if (!dateStr) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;

    let kind: Event["kind"];
    if (typeRaw.startsWith("BUY")) kind = "BUY";
    else if (typeRaw.startsWith("SELL")) kind = "SELL";
    else if (typeRaw.includes("DIVIDEND")) kind = "DIVIDEND";
    else if (typeRaw.includes("TOP-UP") || typeRaw.includes("TOP UP")) kind = "TOP_UP";
    else if (typeRaw.includes("WITHDRAWAL")) kind = "WITHDRAWAL";
    else if (typeRaw.includes("FEE") || typeRaw.includes("MANAGEMENT")) kind = "FEE";
    else kind = "OTHER";

    events.push({ date: d, ticker, kind, quantity, price, amount, currency });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const holdings = new Map<string, RevolutInvestmentHolding>();
  let cash = 0;
  let contributions = 0;
  let withdrawals = 0;
  let dividends = 0;
  let fees = 0;
  let buys = 0;
  let sells = 0;

  const snapshotsByDay = new Map<string, RevolutInvestmentSnapshot>();

  function getHolding(ticker: string, currency: string): RevolutInvestmentHolding {
    let h = holdings.get(ticker);
    if (!h) {
      h = {
        ticker,
        currency: currency || "EUR",
        quantity: 0,
        avgCost: 0,
        totalCost: 0,
        realizedPnl: 0,
        totalDividends: 0,
        lastPrice: 0,
        buys: 0,
        sells: 0,
      };
      holdings.set(ticker, h);
    }
    return h;
  }

  function snapshotEndOfDay(date: Date) {
    let positionValue = 0;
    for (const h of holdings.values()) {
      if (h.quantity > 0) positionValue += h.quantity * h.lastPrice;
    }
    const ymd = ymdUtc(date);
    snapshotsByDay.set(ymd, {
      date: ymd,
      value: cash + positionValue,
      cash,
      positionValue,
    });
  }

  for (const e of events) {
    const cashFlow = Math.abs(e.amount);
    switch (e.kind) {
      case "TOP_UP":
        cash += cashFlow;
        contributions += cashFlow;
        break;
      case "WITHDRAWAL":
        cash -= cashFlow;
        withdrawals += cashFlow;
        break;
      case "FEE":
        cash -= cashFlow;
        fees += cashFlow;
        break;
      case "DIVIDEND": {
        cash += cashFlow;
        dividends += cashFlow;
        if (e.ticker) {
          const h = getHolding(e.ticker, e.currency);
          h.totalDividends += cashFlow;
        }
        break;
      }
      case "BUY": {
        if (!e.ticker || e.quantity <= 0) break;
        cash -= cashFlow;
        buys += cashFlow;
        const h = getHolding(e.ticker, e.currency);
        const newQty = h.quantity + e.quantity;
        const newCost = h.totalCost + cashFlow;
        h.quantity = newQty;
        h.totalCost = newCost;
        h.avgCost = newQty > 0 ? newCost / newQty : 0;
        h.lastPrice = e.price || h.lastPrice;
        h.buys += cashFlow;
        break;
      }
      case "SELL": {
        if (!e.ticker || e.quantity <= 0) break;
        cash += cashFlow;
        sells += cashFlow;
        const h = getHolding(e.ticker, e.currency);
        const soldQty = Math.min(e.quantity, h.quantity);
        const costRemoved = soldQty * h.avgCost;
        h.quantity -= soldQty;
        h.totalCost = Math.max(0, h.totalCost - costRemoved);
        h.realizedPnl += cashFlow - costRemoved;
        h.lastPrice = e.price || h.lastPrice;
        h.sells += cashFlow;
        if (h.quantity <= 1e-9) {
          h.quantity = 0;
          h.avgCost = 0;
          h.totalCost = 0;
        }
        break;
      }
      default:
        break;
    }
    snapshotEndOfDay(e.date);
  }

  const snapshots = Array.from(snapshotsByDay.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const finalSnap = snapshots[snapshots.length - 1];
  const finalCash = cash;
  const finalPositionValue = finalSnap?.positionValue ?? 0;
  const finalValue = finalSnap?.value ?? cash;

  if (events.length === 0) {
    warnings.push("Aucune transaction détectée");
  }

  // Public events list — typed cash-flow events for downstream persistence
  // (account_cashflow). Buy/sell sign convention: BUY = cash flowing OUT of
  // the cash balance (negative), SELL = cash IN (positive). Deposits/dividends
  // are positive, withdrawals/fees are negative.
  const publicEvents: RevolutInvestmentEvent[] = [];
  for (const e of events) {
    if (e.kind === "OTHER") continue;
    const cashFlow = Math.abs(e.amount);
    let pubKind: RevolutCashflowKind;
    let signed: number;
    switch (e.kind) {
      case "TOP_UP":
        pubKind = "deposit";
        signed = +cashFlow;
        break;
      case "WITHDRAWAL":
        pubKind = "withdrawal";
        signed = -cashFlow;
        break;
      case "DIVIDEND":
        pubKind = "dividend";
        signed = +cashFlow;
        break;
      case "FEE":
        pubKind = "fee";
        signed = -cashFlow;
        break;
      case "BUY":
        pubKind = "buy";
        signed = -cashFlow;
        break;
      case "SELL":
        pubKind = "sell";
        signed = +cashFlow;
        break;
      default:
        continue;
    }
    publicEvents.push({
      date: e.date,
      kind: pubKind,
      amount: signed,
      ticker: e.ticker || undefined,
      quantity: e.quantity || undefined,
      price: e.price || undefined,
      currency: e.currency || "EUR",
    });
  }

  return {
    format: "investment-transactions",
    holdings: Array.from(holdings.values()).sort((a, b) => a.ticker.localeCompare(b.ticker)),
    snapshots,
    events: publicEvents,
    totals: {
      contributions,
      withdrawals,
      dividends,
      fees,
      buys,
      sells,
      finalCash,
      finalPositionValue,
      finalValue,
      eventCount: events.length,
    },
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Flat savings statement (French)
// Header: Date,Description,Taux d'intérêt brut gagné,Argent entrant,Argent sortant,Solde
// Date format: "1 oct. 2025"
// Number format: "2 043,26€"
// ─────────────────────────────────────────────────────────────────────

export type RevolutSavingsSnapshot = {
  date: string; // YYYY-MM-DD
  value: number;
};

export type RevolutSavingsResult = {
  format: "savings";
  snapshots: RevolutSavingsSnapshot[];
  totals: {
    deposits: number;
    withdrawals: number;
    interest: number;
    finalBalance: number;
    eventCount: number;
  };
  warnings: string[];
};

const FR_MONTHS: Record<string, number> = {
  "janv.": 1,
  janv: 1,
  janvier: 1,
  "févr.": 2,
  fevr: 2,
  fev: 2,
  fevrier: 2,
  février: 2,
  mars: 3,
  "avr.": 4,
  avr: 4,
  avril: 4,
  mai: 5,
  juin: 6,
  "juil.": 7,
  juil: 7,
  juillet: 7,
  août: 8,
  aout: 8,
  "sept.": 9,
  sept: 9,
  septembre: 9,
  "oct.": 10,
  oct: 10,
  octobre: 10,
  "nov.": 11,
  nov: 11,
  novembre: 11,
  "déc.": 12,
  dec: 12,
  decembre: 12,
  décembre: 12,
};

function parseFrDate(raw: string): Date | null {
  if (!raw) return null;
  const cleaned = raw.replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const m = cleaned.match(/^(\d{1,2})\s+([a-zéûôâ.]+)\s+(\d{4})$/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthRaw = m[2];
  const year = parseInt(m[3], 10);
  const month = FR_MONTHS[monthRaw] ?? FR_MONTHS[monthRaw.replace(/\.$/, "")];
  if (!month) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function parseFrAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/ /g, " ")
    .replace(/[€$£]/g, "")
    .replace(/EUR|USD|GBP/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function isSavingsHeader(headerCols: string[]): boolean {
  const norm = headerCols.map((c) => normalizeHeader(c));
  return (
    norm.includes("date") &&
    norm.some((c) => c.includes("argent_entrant") || c.includes("entrant")) &&
    norm.some((c) => c.includes("argent_sortant") || c.includes("sortant")) &&
    norm.includes("solde")
  );
}

export function parseRevolutSavingsCsv(raw: string): RevolutSavingsResult {
  const warnings: string[] = [];
  const empty: RevolutSavingsResult = {
    format: "savings",
    snapshots: [],
    totals: { deposits: 0, withdrawals: 0, interest: 0, finalBalance: 0, eventCount: 0 },
    warnings,
  };
  if (!raw || !raw.trim()) {
    warnings.push("Fichier vide");
    return empty;
  }

  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    warnings.push("Fichier vide");
    return empty;
  }

  const headerCols = splitCsvLine(lines[0]);
  if (!isSavingsHeader(headerCols)) {
    warnings.push("Format inattendu : en-tête de relevé épargne non reconnu");
    return empty;
  }

  const hmap: Record<string, number> = {};
  headerCols.forEach((h, i) => (hmap[normalizeHeader(h)] = i));
  const findIdx = (predicate: (k: string) => boolean): number | undefined => {
    for (const k of Object.keys(hmap)) if (predicate(k)) return hmap[k];
    return undefined;
  };
  const dateIdx = hmap["date"];
  const inIdx = findIdx((k) => k.includes("entrant"))!;
  const outIdx = findIdx((k) => k.includes("sortant"))!;
  const balIdx = hmap["solde"];
  const descIdx = hmap["description"];

  let deposits = 0;
  let withdrawals = 0;
  let interest = 0;

  type Row = { date: Date; balance: number };
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 3) continue;

    const dateStr = decodeEntities(cols[dateIdx] ?? "");
    const d = parseFrDate(dateStr);
    if (!d) continue;

    const inAmt = parseFrAmount(cols[inIdx] ?? "");
    const outAmt = parseFrAmount(cols[outIdx] ?? "");
    const balance = parseFrAmount(cols[balIdx] ?? "");
    const desc = decodeEntities(cols[descIdx] ?? "").toLowerCase();

    if (desc.includes("intérêt") || desc.includes("interet")) interest += inAmt;
    else if (inAmt > 0) deposits += inAmt;
    if (outAmt > 0) withdrawals += outAmt;

    rows.push({ date: d, balance });
  }

  if (rows.length === 0) {
    warnings.push("Aucune ligne d'épargne détectée");
  }

  // Dedupe per day: keep the LAST balance entry encountered for that day.
  const byDay = new Map<string, RevolutSavingsSnapshot>();
  for (const r of rows) {
    const ymd = ymdUtc(r.date);
    byDay.set(ymd, { date: ymd, value: r.balance });
  }
  const snapshots = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    format: "savings",
    snapshots,
    totals: {
      deposits,
      withdrawals,
      interest,
      finalBalance: snapshots[snapshots.length - 1]?.value ?? 0,
      eventCount: rows.length,
    },
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Auto-detect any of the three formats
// ─────────────────────────────────────────────────────────────────────

export type RevolutTaxReportResult = RevolutImportResult & { format: "tax-report" };

export type RevolutAnyResult =
  | RevolutTaxReportResult
  | RevolutInvestmentResult
  | RevolutSavingsResult;

export function detectAndParseRevolut(raw: string): RevolutAnyResult {
  const text = (raw ?? "").replace(/\r\n/g, "\n");
  // Find first non-blank line
  const firstLine = text.split("\n").find((l) => l.trim() !== "") ?? "";
  const headerCols = splitCsvLine(firstLine);

  if (isSavingsHeader(headerCols)) {
    return parseRevolutSavingsCsv(text);
  }
  if (isInvestmentTransactionsHeader(headerCols)) {
    return parseRevolutInvestmentCsv(text);
  }
  const taxReport = parseRevolutCsv(text);
  return { ...taxReport, format: "tax-report" };
}
