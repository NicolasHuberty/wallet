import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
  getRequisition,
  getAccountDetails,
  isConfigured,
} from "@/lib/gocardless";

// GoCardless redirects the user back here after the bank-side authorisation
// flow. The `?ref=...` query parameter matches the `reference` we stored
// when the requisition was created. We finalise the connection by fetching
// the requisition (which now contains the linked account ids) and persisting
// minimal metadata for each. The user lands on /banking/${connectionId} so
// they can map bank accounts → app accounts.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref) {
    return NextResponse.redirect(
      new URL("/banking?error=missing-ref", req.url),
      { status: 302 },
    );
  }
  if (!isConfigured()) {
    return NextResponse.redirect(
      new URL("/banking?error=not-configured", req.url),
      { status: 302 },
    );
  }

  const [conn] = await db
    .select()
    .from(schema.bankConnection)
    .where(eq(schema.bankConnection.reference, ref));
  if (!conn) {
    return NextResponse.redirect(
      new URL("/banking?error=unknown-ref", req.url),
      { status: 302 },
    );
  }

  try {
    const req_ = await getRequisition(conn.requisitionId);
    // Status codes from GoCardless: CR (created), GA (giving access),
    // UA (user accepted, has access), GC (granting access),
    // EX (expired), RJ (rejected), SU (suspended).
    const ok = req_.status === "LN" || req_.status === "UA" || req_.status === "GA";
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    await db
      .update(schema.bankConnection)
      .set({
        status: ok ? "active" : "error",
        acceptedAt: ok ? new Date() : null,
        expiresAt: ok ? expiresAt : null,
        errorMessage: ok ? null : `status=${req_.status}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.bankConnection.id, conn.id));
    if (!ok) {
      return NextResponse.redirect(
        new URL(`/banking?error=auth-failed`, req.url),
        { status: 302 },
      );
    }
    // Pre-fetch each account's details so the mapping screen has IBAN/name.
    // Failures here are non-fatal — user still lands on the mapping page.
    for (const accId of req_.accounts) {
      try {
        await getAccountDetails(accId);
      } catch (e) {
        console.error("getAccountDetails failed", e);
      }
    }
    return NextResponse.redirect(
      new URL(`/banking?connected=${conn.id}`, req.url),
      { status: 302 },
    );
  } catch (e) {
    console.error("callback failed", e);
    await db
      .update(schema.bankConnection)
      .set({
        status: "error",
        errorMessage: (e as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(schema.bankConnection.id, conn.id));
    return NextResponse.redirect(
      new URL("/banking?error=callback-failed", req.url),
      { status: 302 },
    );
  }
}
