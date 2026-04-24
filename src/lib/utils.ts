import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely convert a value returned by Drizzle (which may be `string | Date`
 * depending on the runtime driver) into a real `Date` instance.
 */
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") return new Date(value)
  throw new Error(`Cannot convert to Date: ${typeof value}`)
}

/** Nullable variant of {@link toDate}. Returns `null` for `null`/`undefined`. */
export function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  return toDate(value)
}
