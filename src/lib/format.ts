export function formatEUR(value: number, opts: { compact?: boolean; signed?: boolean } = {}) {
  const formatter = new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: opts.compact ? 0 : 0,
    notation: opts.compact ? "compact" : "standard",
    signDisplay: opts.signed ? "exceptZero" : "auto",
  });
  return formatter.format(value);
}

export function formatPct(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat("fr-BE", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: "exceptZero",
  }).format(value / 100);
}

export function formatDateFR(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-BE", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatMonthYear(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-BE", { month: "short", year: "2-digit" }).format(d);
}
