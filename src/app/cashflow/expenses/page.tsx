import Link from "next/link";
import { getPrimaryHousehold } from "@/lib/queries";
import { getMonthExpenses } from "@/lib/cashflow/data";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { ExpensesView } from "./expenses-view";

export const dynamic = "force-dynamic";

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Décale un `YYYY-MM` de `delta` mois. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

export default async function CashflowExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const h = await getPrimaryHousehold();
  const data = await getMonthExpenses(h.id, m);

  const prev = shiftMonth(data.month, -1);
  const next = shiftMonth(data.month, 1);
  const nowMonth = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const isFuture = data.month >= nowMonth;

  return (
    <>
      <PageHeader
        title="Dépenses du mois"
        subtitle={monthLabel(data.month)}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/cashflow"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" /> Cap
            </Link>
            <div className="flex items-center rounded-md border border-border">
              <Link
                href={`/cashflow/expenses?m=${prev}`}
                aria-label="Mois précédent"
                className="px-2 py-2 hover:bg-muted"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <span className="border-x border-border px-3 py-2 text-xs font-medium tabular-nums">
                {data.month}
              </span>
              <Link
                href={isFuture ? "/cashflow/expenses" : `/cashflow/expenses?m=${next}`}
                aria-disabled={isFuture}
                aria-label="Mois suivant"
                className={`px-2 py-2 ${isFuture ? "pointer-events-none opacity-40" : "hover:bg-muted"}`}
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        }
      />

      <div className="p-4 md:p-8">
        <ExpensesView
          transactions={data.transactions}
          monthlyTotals={data.monthlyTotals}
          envelopes={data.envelopes}
          accounts={data.accounts}
          total={data.total}
          unaffectedCount={data.unaffectedCount}
        />
      </div>
    </>
  );
}
