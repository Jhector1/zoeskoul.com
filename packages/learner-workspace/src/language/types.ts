
export type LanguageSkill =
  | "listening"
  | "speaking"
  | "reading"
  | "writing"
  | "pronunciation"
  | "vocabulary"
  | "grammar"
  | "conversation"
  | "culture";

export type LearnerTextNormalizationPolicy = {
  unicodeForm?: "NFC" | "NFD" | "NFKC" | "NFKD";
  normalizeApostrophes?: boolean;
  trim?: boolean;
  collapseSpaces?: boolean;
  caseFold?: boolean;
  caseFoldLocale?: string;
  stripPunctuation?: boolean;
  preserveApostrophes?: boolean;
};

export type LanguageSpeechProfile = {
  recognitionLocales: readonly string[];
  transcriptionLanguage: string;
  transcriptionPrompt: string;
  tts: {
    voice?: string;
    normalSpeed: number;
    slowSpeed: number;
    instructions: string;
  };
};

export type LanguageLearningProfile = {
  id: string;
  slug: string;
  displayName: string;
  nativeName: string;
  iso6391: string;
  iso6393: string;
  bcp47: string;
  direction: "ltr" | "rtl";
  skills: readonly LanguageSkill[];
  normalization: LearnerTextNormalizationPolicy;
  speech: LanguageSpeechProfile;
  orthography: {
    preserveDiacritics: boolean;
    canonicalApostrophe: "'";
    notes: readonly string[];
  };
};
