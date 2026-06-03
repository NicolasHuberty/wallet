import { describe, it, expect } from "vitest";
import { computePacing, pacingColor } from "./pacing";

describe("computePacing", () => {
  it("dans le rythme quand consommation = écoulement du temps", () => {
    const r = computePacing({ planned: 300, consumed: 100, day: 10, totalDays: 30 });
    expect(r.ratioTime).toBeCloseTo(1 / 3);
    expect(r.ratioConsumed).toBeCloseTo(1 / 3);
    expect(r.velocity).toBeCloseTo(1);
    expect(r.state).toBe("on_track");
    expect(r.remaining).toBe(200);
  });

  it("orange (fast) quand on brûle nettement trop vite", () => {
    const r = computePacing({ planned: 360, consumed: 290, day: 15, totalDays: 30 });
    // ratioTime 0.5, ratioConsumed ~0.806, velocity ~1.6
    expect(r.velocity).toBeGreaterThan(1.3);
    expect(r.state).toBe("fast");
  });

  it("jaune (slightly_fast) entre 1.0 et 1.3", () => {
    const r = computePacing({ planned: 100, consumed: 40, day: 10, totalDays: 30 });
    // velocity = 0.4 / 0.333 = 1.2
    expect(r.state).toBe("slightly_fast");
  });

  it("over dès que la consommation atteint le plan", () => {
    const r = computePacing({ planned: 100, consumed: 100, day: 20, totalDays: 30 });
    expect(r.state).toBe("over");
    expect(r.remaining).toBe(0);
    expect(r.overspent).toBe(0);
  });

  it("over avec dépassement chiffré", () => {
    const r = computePacing({ planned: 100, consumed: 130, day: 20, totalDays: 30 });
    expect(r.state).toBe("over");
    expect(r.overspent).toBe(30);
  });

  it("neutral sans budget planifié", () => {
    const r = computePacing({ planned: 0, consumed: 0, day: 10, totalDays: 30 });
    expect(r.state).toBe("neutral");
  });

  it("borne le jour et évite la division par zéro", () => {
    const r = computePacing({ planned: 100, consumed: 0, day: 0, totalDays: 0 });
    expect(Number.isFinite(r.velocity)).toBe(true);
    expect(r.state).toBe("on_track");
  });
});

describe("pacingColor", () => {
  it("mappe états → couleurs", () => {
    expect(pacingColor("on_track")).toBe("green");
    expect(pacingColor("slightly_fast")).toBe("yellow");
    expect(pacingColor("fast")).toBe("orange");
    expect(pacingColor("over")).toBe("red");
    expect(pacingColor("neutral")).toBe("neutral");
  });
});
