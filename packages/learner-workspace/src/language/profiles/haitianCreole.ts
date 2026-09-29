
import type { LanguageLearningProfile } from "../types";

export const HAITIAN_CREOLE_LANGUAGE_PROFILE = {
  id: "haitian-creole",
  slug: "haitian-creole",
  displayName: "Haitian Creole",
  nativeName: "Kreyòl Ayisyen",
  iso6391: "ht",
  iso6393: "hat",
  bcp47: "ht-HT",
  direction: "ltr",
  skills: [
    "listening",
    "speaking",
    "reading",
    "writing",
    "pronunciation",
    "vocabulary",
    "grammar",
    "conversation",
    "culture",
  ],
  normalization: {
    unicodeForm: "NFC",
    normalizeApostrophes: true,
    trim: true,
    collapseSpaces: true,
    caseFold: true,
    caseFoldLocale: "ht",
    stripPunctuation: false,
    preserveApostrophes: true,
  },
  speech: {
    recognitionLocales: ["ht-HT", "ht"],
    transcriptionLanguage: "ht",
    transcriptionPrompt:
      "Lang: Kreyòl ayisyen. Transkri egzakteman sa w tande a. Pa tradui. Kenbe òtograf Kreyòl nòmal.",
    tts: {
      voice: "marin",
      normalSpeed: 1,
      slowSpeed: 0.82,
      instructions:
        "Speak in Haitian Creole (Kreyòl ayisyen). Use natural Haitian pronunciation. Do not translate. Clear, friendly, teacher-like delivery.",
    },
  },
  orthography: {
    preserveDiacritics: true,
    canonicalApostrophe: "'",
    notes: [
      "Preserve Kreyòl diacritics such as è and ò.",
      "Normalize typographic apostrophes to the ASCII apostrophe for stable grading.",
      "Do not automatically expand learner contractions; accepted variants belong to exercise grading policy.",
    ],
  },
} as const satisfies LanguageLearningProfile;

export type HaitianCreoleLanguageProfile =
  typeof HAITIAN_CREOLE_LANGUAGE_PROFILE;
