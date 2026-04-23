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
