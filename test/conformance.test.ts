import { describe, expect, test } from "vitest";
import { conformanceChecklist } from "../src/conformance.js";

describe("SPEC sections 17 and 18 conformance checklist", () => {
  test("maps every implemented conformance area to an automated test suite", () => {
    expect(conformanceChecklist.map((entry) => entry.section)).toEqual([
      "17.1",
      "17.2",
      "17.3",
      "17.4",
      "17.5",
      "17.6",
      "17.7",
      "17.8",
      "18.1"
    ]);
    expect(conformanceChecklist.every((entry) => entry.tests.length > 0)).toBe(true);
  });
});
