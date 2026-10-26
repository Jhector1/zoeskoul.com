import { describe, expect, it } from "vitest";
import { isZoeSourceEditInstruction, isZoeStandalonePageInstruction } from "./zoeAssistantEditIntent";

describe("Zoé natural-language targeted edits", () => {
  it("routes put, move, and separate to the existing edit workflow", () => {
    for (const prompt of [
      "put the privacy policy in its own page",
      "move About to its own page",
      "separate Contact into a new page",
      "please create a Privacy Policy page",
    ]) {
      expect(isZoeSourceEditInstruction(prompt)).toBe(true);
      expect(isZoeStandalonePageInstruction(prompt)).toBe(true);
    }
  });
  it("does not infer an edit from a read-only question or unrelated prose", () => {
    expect(isZoeSourceEditInstruction("what pages exist in this project?")).toBe(false);
    expect(isZoeStandalonePageInstruction("explain the privacy policy")).toBe(false);
    expect(isZoeStandalonePageInstruction("change the hero color")).toBe(false);
  });
});
