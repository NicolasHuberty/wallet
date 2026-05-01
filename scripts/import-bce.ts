// Import the Belgian Crossroads Bank for Enterprises (BCE / KBO) bulk
// open-data dump into our `bce_company` table.
//
// Usage
// -----
// 1. Register a free account on
//    https://kbopub.economie.fgov.be/affiliationRegistration
// 2. Download the latest monthly ZIP (about ~600 MB compressed,
//    ~3 GB extracted) — link arrives by email, eg.
//    `KboOpenData_2026_05_Full.zip`
// 3. Extract it locally:
//      unzip KboOpenData_2026_05_Full.zip -d /tmp/kbo
// 4. Run the importer pointing to the extracted directory:
//      DATABASE_URL=postgres://... \
//        npx tsx scripts/import-bce.ts /tmp/kbo
//
// The script streams 3 of the CSVs (enterprise / denomination / activity)
// without loading them entirely into memory. It picks the legal name
// (TypeOfDenomination = 001), the commercial name when present (003), and
// the primary 2008-version NACE code (Classification = MAIN). Existing
// rows are updated by ON CONFLICT.

import { readFileSync, existsSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { db, schema } from "../src/db";
import { sql } from "drizzle-orm";
import { normalizeBceName } from "../src/lib/bce";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Aborting.");
  process.exit(1);
}

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: npx tsx scripts/import-bce.ts <extracted-zip-dir>");
  console.error("");
  console.error("Get the dump from https://kbopub.economie.fgov.be/kbo-open-data/");
  process.exit(1);
}

const ENTERPRISE_CSV = join(dir, "enterprise.csv");
const DENOMINATION_CSV = join(dir, "denomination.csv");
const ACTIVITY_CSV = join(dir, "activity.csv");
const CODE_CSV = join(dir, "code.csv"); // Optional — translations for NACE codes

for (const f of [ENTERPRISE_CSV, DENOMINATION_CSV, ACTIVITY_CSV]) {
  if (!existsSync(f)) {
    console.error(`Missing file: ${f}`);
    process.exit(1);
  }
}

// ─── CSV utilities ────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function* csvRows(path: string): AsyncGenerator<Record<string, string>> {
  const stream = createReadStream(path, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const raw of rl) {
    if (!raw) continue;
    const cols = parseCsvLine(raw);
    if (!header) {
      header = cols.map((c) => c.trim());
      continue;
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = (cols[i] ?? "").trim();
    yield row;
  }
}

function normaliseEnterpriseNumber(raw: string): string | null {
  const stripped = raw.replace(/\D/g, "");
  if (stripped.length !== 10) return null;
  return stripped;
}

// ─── Pass 1: optional code.csv — NACE description lookup ─────────────

async function loadNaceCodeDescriptions(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!existsSync(CODE_CSV)) return out;
  for await (const r of csvRows(CODE_CSV)) {
    if (r.Category !== "Nace2008") continue;
    const lang = r.Language;
    if (lang !== "FR" && lang !== "EN" && lang !== "NL") continue;
    const code = r.Code?.replace(/[^0-9]/g, "");
    const desc = r.Description;
    if (!code || !desc) continue;
    // Prefer FR > NL > EN
    const existing = out.get(code);
    if (!existing || lang === "FR" || (lang === "NL" && existing.startsWith("[EN]"))) {
      out.set(code, desc);
    }
  }
  return out;
}

// ─── Pass 2: activity.csv → primary NACE per enterprise ──────────────

async function loadActivities(): Promise<Map<string, { code: string; version: string }>> {
  const out = new Map<string, { code: string; version: string }>();
  let count = 0;
  for await (const r of csvRows(ACTIVITY_CSV)) {
    count++;
    if (count % 1_000_000 === 0) console.log(`  activity.csv: ${count.toLocaleString()} rows`);
    if (r.Classification !== "MAIN") continue;
    const ent = normaliseEnterpriseNumber(r.EntityNumber);
    if (!ent) continue;
    const code = r.NaceCode?.replace(/[^0-9]/g, "");
    if (!code) continue;
    const version = r.NaceVersion ?? "";
    // Prefer 2008 > 2003 > anything else
    const existing = out.get(ent);
    if (!existing || version === "2008") {
      out.set(ent, { code, version });
    }
  }
  console.log(`  activity.csv: ${count.toLocaleString()} rows total, ${out.size.toLocaleString()} enterprises with MAIN`);
  return out;
}

// ─── Pass 3: denomination.csv → names per enterprise ────────────────

async function loadDenominations(
  filterToNace: Map<string, unknown>,
): Promise<Map<string, { legal: string; commercial?: string }>> {
  const out = new Map<string, { legal: string; commercial?: string }>();
  let count = 0;
  for await (const r of csvRows(DENOMINATION_CSV)) {
    count++;
    if (count % 1_000_000 === 0) console.log(`  denomination.csv: ${count.toLocaleString()} rows`);
    const ent = normaliseEnterpriseNumber(r.EntityNumber);
    if (!ent) continue;
    if (!filterToNace.has(ent)) continue;
    const type = r.TypeOfDenomination;
    const lang = r.Language;
    const name = r.Denomination?.trim();
    if (!name) continue;
    if (type !== "001" && type !== "003") continue;
    const slot = out.get(ent) ?? { legal: "", commercial: undefined };
    if (type === "001") {
      // Prefer FR (1) > NL (2) > DE (3) > EN (4)
      if (!slot.legal || lang === "1" || lang === "2") {
        slot.legal = name;
      }
    } else if (type === "003") {
      if (!slot.commercial || lang === "1" || lang === "2") {
        slot.commercial = name;
      }
    }
    out.set(ent, slot);
  }
  console.log(`  denomination.csv: ${count.toLocaleString()} rows, ${out.size.toLocaleString()} matched`);
  return out;
}

// ─── Pass 4: enterprise.csv → status / juridicalForm ────────────────

async function loadEnterpriseMeta(
  filter: Map<string, unknown>,
): Promise<Map<string, { status: string | null; juridicalForm: string | null; startDate: Date | null }>> {
  const out = new Map<string, { status: string | null; juridicalForm: string | null; startDate: Date | null }>();
  let count = 0;
  for await (const r of csvRows(ENTERPRISE_CSV)) {
    count++;
    if (count % 1_000_000 === 0) console.log(`  enterprise.csv: ${count.toLocaleString()} rows`);
    const ent = normaliseEnterpriseNumber(r.EnterpriseNumber);
    if (!ent || !filter.has(ent)) continue;
    let startDate: Date | null = null;
    if (r.StartDate) {
      const m = r.StartDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (m) startDate = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
    }
    out.set(ent, {
      status: r.Status || null,
      juridicalForm: r.JuridicalForm || null,
      startDate,
    });
  }
  console.log(`  enterprise.csv: ${count.toLocaleString()} rows, ${out.size.toLocaleString()} matched`);
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.time("Total");

  console.log("Pass 1/4 — NACE code descriptions (code.csv) …");
  const naceDescriptions = await loadNaceCodeDescriptions();
  console.log(`  ${naceDescriptions.size} NACE descriptions loaded`);

  console.log("Pass 2/4 — activity.csv (NACE per enterprise) …");
  const activityMap = await loadActivities();

  console.log("Pass 3/4 — denomination.csv (names) …");
  const denomMap = await loadDenominations(activityMap);

  console.log("Pass 4/4 — enterprise.csv (status / juridicalForm) …");
  const metaMap = await loadEnterpriseMeta(activityMap);

  console.log(`Building rows for ${denomMap.size.toLocaleString()} enterprises …`);
  type Row = typeof schema.bceCompany.$inferInsert;
  const rows: Row[] = [];
  for (const [ent, names] of denomMap) {
    if (!names.legal) continue;
    const activity = activityMap.get(ent);
    const meta = metaMap.get(ent) ?? { status: null, juridicalForm: null, startDate: null };
    rows.push({
      enterpriseNumber: ent,
      denomination: names.legal,
      commercialName: names.commercial ?? null,
      searchName: normalizeBceName(names.legal),
      naceCode: activity?.code ?? null,
      naceDescription: activity?.code ? naceDescriptions.get(activity.code) ?? null : null,
      status: meta.status,
      juridicalForm: meta.juridicalForm,
      startDate: meta.startDate,
      updatedAt: new Date(),
    });
  }
  console.log(`  ${rows.length.toLocaleString()} rows ready for upsert`);

  // Truncate and re-insert (simpler than ON CONFLICT for monthly refresh)
  console.log("Truncating bce_company …");
  await db.execute(sql`TRUNCATE TABLE bce_company`);

  const CHUNK = 5000;
  console.log(`Inserting in chunks of ${CHUNK} …`);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await db.insert(schema.bceCompany).values(batch);
    if (i % (CHUNK * 10) === 0)
      console.log(`  ${i.toLocaleString()} / ${rows.length.toLocaleString()}`);
  }
  console.log(`Done. ${rows.length.toLocaleString()} companies inserted.`);
  console.timeEnd("Total");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
