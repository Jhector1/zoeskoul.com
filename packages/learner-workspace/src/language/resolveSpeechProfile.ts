
import { HAITIAN_CREOLE_LANGUAGE_PROFILE } from "./profiles/haitianCreole";

export type SpeechSynthesisDefaults = {
  locale: string | null;
  language: string | null;
  voice: string;
  speed: number;
  instructions: string;
};

function normalizeLocale(locale?: string | null): string {
  return String(locale ?? "").trim().replace(/_/g, "-").toLowerCase();
}

export function resolveSpeechLanguage(locale?: string | null): string | null {
  const normalized = normalizeLocale(locale);
  if (!normalized) return null;
  return normalized.split("-")[0] || null;
}

export function isHaitianCreoleLocale(locale?: string | null): boolean {
  return resolveSpeechLanguage(locale) === "ht";
}

export function resolveSpeechSynthesisDefaults(
  locale?: string | null,
): SpeechSynthesisDefaults {
  if (isHaitianCreoleLocale(locale)) {
    const profile = HAITIAN_CREOLE_LANGUAGE_PROFILE;
    return {
      locale: profile.bcp47,
      language: profile.speech.transcriptionLanguage,
      voice: profile.speech.tts.voice ?? "marin",
      speed: profile.speech.tts.normalSpeed,
      instructions: profile.speech.tts.instructions,
    };
  }

  return {
    locale: normalizeLocale(locale) || null,
    language: resolveSpeechLanguage(locale),
    voice: "marin",
    speed: 1,
    instructions:
      "Speak clearly and naturally in the requested language. Friendly teacher tone. Do not translate the text.",
  };
}
