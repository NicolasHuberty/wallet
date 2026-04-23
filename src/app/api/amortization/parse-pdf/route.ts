import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { parseAmortizationPDFText } from "@/lib/pdf-amortization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const parser = new PDFParse({ data: buf });
    const result0 = await parser.getText();
    const text = result0.text ?? "";
    const pageCount = result0.pages?.length ?? 1;

    const result = parseAmortizationPDFText(text, startDate);

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
    return NextResponse.json(
      { error: (e as Error).message ?? "Erreur de parsing PDF" },
      { status: 500 }
    );
  }
}
