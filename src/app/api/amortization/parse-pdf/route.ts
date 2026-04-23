import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { parseAmortizationPDFText } from "@/lib/pdf-amortization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractTextWithPdftotext(buf: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-enc", "UTF-8", "-", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errs: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errs.push(c));
    child.on("error", (e) => reject(new Error(`pdftotext introuvable: ${e.message}. Installe poppler (brew install poppler ou apt install poppler-utils).`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pdftotext exit ${code}: ${Buffer.concat(errs).toString()}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    child.stdin.write(buf);
    child.stdin.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const startDateStr = form.get("startDate");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    if (typeof startDateStr !== "string") {
      return NextResponse.json({ error: "Date de début requise" }, { status: 400 });
    }

    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const text = await extractTextWithPdftotext(buf);
    const result = parseAmortizationPDFText(text, startDate);

    const pageCount = (text.match(/\f/g)?.length ?? 0) + 1;

    return NextResponse.json({
      rows: result.rows.map((r) => ({
        index: r.index,
        dueDate: r.dueDate.toISOString(),
        payment: r.payment,
        interest: r.interest,
        principal: r.principal,
        balance: r.balance,
      })),
      warnings: result.warnings,
      detectedFormat: result.detectedFormat,
      pageCount,
      textLength: text.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
