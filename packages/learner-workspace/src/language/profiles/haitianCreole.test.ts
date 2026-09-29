
import { describe, expect, it } from "vitest";

import { HAITIAN_CREOLE_LANGUAGE_PROFILE } from "./haitianCreole";

describe("HAITIAN_CREOLE_LANGUAGE_PROFILE", () => {
  it("uses Haitian language identifiers consistently", () => {
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.iso6391).toBe("ht");
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.iso6393).toBe("hat");
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.bcp47).toBe("ht-HT");
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.speech.recognitionLocales).toContain("ht");
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.speech.transcriptionLanguage).toBe("ht");
  });

  it("keeps all four core language skills first-class", () => {
    const skills = new Set(HAITIAN_CREOLE_LANGUAGE_PROFILE.skills);
    for (const skill of ["listening", "speaking", "reading", "writing"]) {
      expect(skills.has(skill as never)).toBe(true);
    }
  });

  it("preserves Kreyòl orthography instead of folding diacritics away", () => {
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.orthography.preserveDiacritics).toBe(true);
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.normalization.normalizeApostrophes).toBe(true);
  });

  it("provides normal and slow speech modes", () => {
    expect(HAITIAN_CREOLE_LANGUAGE_PROFILE.speech.tts.normalSpeed).toBeGreaterThan(
      HAITIAN_CREOLE_LANGUAGE_PROFILE.speech.tts.slowSpeed,
    );
  });
});
