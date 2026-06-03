import { describe, it, expect } from "vitest";
import { contextualCategory, guessEnvelope } from "./guess";

describe("contextualCategory", () => {
  it("vendredi soir → loisirs", () => {
    // 2026-06-05 est un vendredi
    expect(contextualCategory(new Date(Date.UTC(2026, 5, 5, 21)))).toBe("leisure");
  });
  it("midi en semaine → food", () => {
    // 2026-06-03 est un mercredi
    expect(contextualCategory(new Date(Date.UTC(2026, 5, 3, 12)))).toBe("food");
  });
  it("mardi après-midi → pas de contexte", () => {
    expect(contextualCategory(new Date(Date.UTC(2026, 5, 2, 16)))).toBeNull();
  });
});

describe("guessEnvelope", () => {
  const envelopes = [
    { id: "courses", category: "food", consumed: 50 },
    { id: "bar", category: "leisure", consumed: 10 },
    { id: "essence", category: "transport", consumed: 0 },
  ];

  it("privilégie la catégorie contextuelle", () => {
    // vendredi soir → leisure → bar
    expect(guessEnvelope(envelopes, new Date(Date.UTC(2026, 5, 5, 22)))).toBe("bar");
  });

  it("à défaut de contexte, prend la plus consommée", () => {
    // mardi après-midi → pas de contexte → courses (50)
    expect(guessEnvelope(envelopes, new Date(Date.UTC(2026, 5, 2, 16)))).toBe("courses");
  });

  it("sinon la première", () => {
    const fresh = [
      { id: "a", category: "x", consumed: 0 },
      { id: "b", category: "y", consumed: 0 },
    ];
    expect(guessEnvelope(fresh, new Date(Date.UTC(2026, 5, 2, 16)))).toBe("a");
  });

  it("null si aucune enveloppe", () => {
    expect(guessEnvelope([], new Date())).toBeNull();
  });
});
