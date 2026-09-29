
import type { LearnerTextNormalizationPolicy } from "./types";

const APOSTROPHE_VARIANTS = /[\u2018\u2019\u02BC\uFF07]/g;

function stripUnicodePunctuation(
  value: string,
  preserveApostrophes: boolean,
): string {
  if (!preserveApostrophes) {
    return value.replace(/[\p{P}\p{S}]+/gu, " ");
  }

  return value
    .split("'")
    .map((part) => part.replace(/[\p{P}\p{S}]+/gu, " "))
    .join("'");
}

export function normalizeLearnerText(
  input: unknown,
  policy: LearnerTextNormalizationPolicy = {},
): string {
  const {
    unicodeForm = "NFC",
    normalizeApostrophes = true,
    trim = true,
    collapseSpaces = true,
    caseFold = false,
    caseFoldLocale,
    stripPunctuation = false,
    preserveApostrophes = true,
  } = policy;

  let value = String(input ?? "").normalize(unicodeForm);

  if (normalizeApostrophes) {
    value = value.replace(APOSTROPHE_VARIANTS, "'");
  }

  if (stripPunctuation) {
    value = stripUnicodePunctuation(value, preserveApostrophes);
  }

  if (collapseSpaces) {
    value = value.replace(/\s+/g, " ");
  }

  if (trim) {
    value = value.trim();
  }

  if (caseFold) {
    value = caseFoldLocale
      ? value.toLocaleLowerCase(caseFoldLocale)
      : value.toLocaleLowerCase();
  }

  return value;
}
