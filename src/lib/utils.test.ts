import { describe, it, expect } from "vitest";
import { cn, toDate, toDateOrNull } from "./utils";

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("conditionally includes classes via object syntax", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("deduplicates conflicting Tailwind classes via twMerge", () => {
    // twMerge keeps the last conflicting utility
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

describe("toDate", () => {
  it("returns the same Date instance when given a Date", () => {
    const d = new Date("2024-06-01T00:00:00Z");
    expect(toDate(d)).toBe(d);
  });

  it("converts an ISO string to a Date", () => {
    const d = toDate("2024-06-01T00:00:00Z");
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(5);
  });

  it("converts a number (epoch) to a Date", () => {
    const d = toDate(1_700_000_000_000);
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBe(1_700_000_000_000);
  });

  it("throws for unsupported types", () => {
    expect(() => toDate({} as unknown)).toThrow();
    expect(() => toDate(null as unknown)).toThrow();
  });
});

describe("toDateOrNull", () => {
  it("returns null for null/undefined", () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
  });

  it("delegates to toDate for everything else", () => {
    const d = toDateOrNull("2024-01-01T00:00:00Z");
    expect(d).toBeInstanceOf(Date);
  });
});
