
import { describe, expect, it } from "vitest";
import {
  isHaitianCreoleLocale,
  resolveSpeechLanguage,
  resolveSpeechSynthesisDefaults,
} from "./resolveSpeechProfile";

describe("resolveSpeechProfile", () => {
  it("recognizes Haitian locale variants", () => {
    expect(isHaitianCreoleLocale("ht")).toBe(true);
    expect(isHaitianCreoleLocale("ht-HT")).toBe(true);
    expect(isHaitianCreoleLocale("HT_ht")).toBe(true);
  });

  it("keeps other languages out of the Haitian profile", () => {
    expect(isHaitianCreoleLocale("fr-FR")).toBe(false);
    expect(isHaitianCreoleLocale("en-US")).toBe(false);
  });

  it("resolves primary language codes", () => {
    expect(resolveSpeechLanguage("ht-HT")).toBe("ht");
    expect(resolveSpeechLanguage("fr-FR")).toBe("fr");
    expect(resolveSpeechLanguage("")).toBeNull();
  });

  it("uses Haitian instructions only for Haitian requests", () => {
    const ht = resolveSpeechSynthesisDefaults("ht-HT");
    const fr = resolveSpeechSynthesisDefaults("fr-FR");
    expect(ht.instructions).toContain("Haitian Creole");
    expect(fr.instructions).not.toContain("Haitian Creole");
  });
});
