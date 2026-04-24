import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` factories are hoisted, so they cannot reference regular test-scope
// variables. Use `vi.hoisted` to share state between the factory and the tests.
const state = vi.hoisted(() => ({
  captured: {
    insertValues: [] as unknown[],
    updateValues: [] as unknown[],
  },
  mockAccounts: [] as Array<{ kind: string; currentValue: number }>,
  mockExistingSnapshot: undefined as { id: string } | undefined,
}));

vi.mock("@/db", () => {
  // Distinguish queries by the first `from()` table identity via a counter
  // since better-auth uses drizzle chains. We'll track state in a closure.
  let currentTable: unknown = null;

  const accountTable = {
    __name: "account",
    householdId: "householdId-col",
  };
  const netWorthSnapshotTable = {
    __name: "net_worth_snapshot",
    id: "id-col",
    householdId: "householdId-col",
    date: "date-col",
  };

  const whereChain = {
    // Called for account listing (returns immediately) or snapshot lookup.
    async then(resolve: (v: unknown[]) => void) {
      if (currentTable === accountTable) {
        resolve(state.mockAccounts);
      } else if (currentTable === netWorthSnapshotTable) {
        resolve(state.mockExistingSnapshot ? [state.mockExistingSnapshot] : []);
      } else {
        resolve([]);
      }
    },
  };

  const fromChain = {
    where: () => whereChain,
    // Some drizzle-orm calls await .from() directly; support that too.
    async then(resolve: (v: unknown[]) => void) {
      if (currentTable === accountTable) resolve(state.mockAccounts);
      else resolve([]);
    },
  };

  const selectChain = {
    from: (table: unknown) => {
      currentTable = table;
      return fromChain;
    },
  };

  const insertChain = {
    values: (payload: unknown) => {
      state.captured.insertValues.push(payload);
      return {
        returning: async () => [{ id: "generated-id" }],
      };
    },
  };

  const updateChain = {
    set: (payload: unknown) => {
      state.captured.updateValues.push(payload);
      return {
        where: async () => undefined,
      };
    },
  };

  return {
    db: {
      select: () => selectChain,
      insert: () => insertChain,
      update: () => updateChain,
      delete: () => ({ where: async () => undefined }),
    },
    schema: {
      account: accountTable,
      netWorthSnapshot: netWorthSnapshotTable,
    },
  };
});

// drizzle-orm operators — keep them as simple pass-throughs.
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  gte: (a: unknown, b: unknown) => ({ op: "gte", a, b }),
  lte: (a: unknown, b: unknown) => ({ op: "lte", a, b }),
}));

// Import the module under test AFTER setting up the mocks.
import { recomputeSnapshot, upsertManualSnapshot } from "./snapshots";

beforeEach(() => {
  state.captured.insertValues = [];
  state.captured.updateValues = [];
  state.mockAccounts = [];
  state.mockExistingSnapshot = undefined;
});

describe("recomputeSnapshot", () => {
  it("sums positive balances as assets and ignores liabilities", async () => {
    state.mockAccounts = [
      { kind: "cash", currentValue: 5_000 },
      { kind: "savings", currentValue: 10_000 },
      { kind: "brokerage", currentValue: 20_000 },
    ];
    const id = await recomputeSnapshot("hh1");
    expect(id).toBe("generated-id");
    expect(state.captured.insertValues).toHaveLength(1);
    const payload = state.captured.insertValues[0] as {
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
      breakdown: string;
    };
    expect(payload.totalAssets).toBe(35_000);
    expect(payload.totalLiabilities).toBe(0);
    expect(payload.netWorth).toBe(35_000);
    const breakdown = JSON.parse(payload.breakdown);
    expect(breakdown.cash).toBe(5_000);
    expect(breakdown.savings).toBe(10_000);
    expect(breakdown.brokerage).toBe(20_000);
  });

  it("treats loan/credit_card kinds as liabilities (absolute value)", async () => {
    state.mockAccounts = [
      { kind: "cash", currentValue: 5_000 },
      { kind: "loan", currentValue: -100_000 },
      { kind: "credit_card", currentValue: -500 },
    ];
    await recomputeSnapshot("hh1");
    const payload = state.captured.insertValues[0] as {
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
    };
    expect(payload.totalAssets).toBe(5_000);
    expect(payload.totalLiabilities).toBe(100_500);
    expect(payload.netWorth).toBe(-95_500);
  });

  it("counts any asset with a negative balance as a liability", async () => {
    state.mockAccounts = [
      // A cash account technically in the red → should count as liability.
      { kind: "cash", currentValue: -200 },
      { kind: "savings", currentValue: 1_000 },
    ];
    await recomputeSnapshot("hh1");
    const payload = state.captured.insertValues[0] as {
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
    };
    expect(payload.totalAssets).toBe(1_000);
    expect(payload.totalLiabilities).toBe(200);
    expect(payload.netWorth).toBe(800);
  });

  it("updates the existing snapshot when one already exists for the date", async () => {
    state.mockAccounts = [{ kind: "cash", currentValue: 1_000 }];
    state.mockExistingSnapshot = { id: "existing-123" };
    const id = await recomputeSnapshot("hh1");
    expect(id).toBe("existing-123");
    expect(state.captured.updateValues).toHaveLength(1);
    expect(state.captured.insertValues).toHaveLength(0);
  });

  it("normalizes the snapshot date to the start of the day", async () => {
    state.mockAccounts = [{ kind: "cash", currentValue: 100 }];
    const input = new Date(2024, 4, 15, 14, 37, 22, 500); // May 15 2024 14:37
    await recomputeSnapshot("hh1", input);
    const payload = state.captured.insertValues[0] as { date: Date };
    expect(payload.date.getFullYear()).toBe(2024);
    expect(payload.date.getMonth()).toBe(4);
    expect(payload.date.getDate()).toBe(15);
    expect(payload.date.getHours()).toBe(0);
    expect(payload.date.getMinutes()).toBe(0);
    expect(payload.date.getSeconds()).toBe(0);
  });
});

describe("upsertManualSnapshot", () => {
  it("stores provided totals and derives netWorth", async () => {
    const id = await upsertManualSnapshot("hh1", new Date(2024, 3, 10), 50_000, 20_000);
    expect(id).toBe("generated-id");
    const payload = state.captured.insertValues[0] as {
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
      breakdown: string | null;
    };
    expect(payload.totalAssets).toBe(50_000);
    expect(payload.totalLiabilities).toBe(20_000);
    expect(payload.netWorth).toBe(30_000);
    // Manual snapshots don't carry an account breakdown.
    expect(payload.breakdown).toBeNull();
  });

  it("updates an existing row instead of inserting a duplicate", async () => {
    state.mockExistingSnapshot = { id: "prev-42" };
    const id = await upsertManualSnapshot("hh1", new Date(2024, 3, 10), 100, 0);
    expect(id).toBe("prev-42");
    expect(state.captured.updateValues).toHaveLength(1);
    expect(state.captured.insertValues).toHaveLength(0);
  });
});
