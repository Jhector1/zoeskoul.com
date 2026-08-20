"use client";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import { useTaggedT } from "@student/i18n/tagged";
import { normalizeMath } from "@zoeskoul/learner-ui/lib/markdown/normalizeMath";
import React from "react";

type LearnerFacingExercise = {
  title?: unknown;
  prompt?: unknown;
  readonly [key: string]: unknown;
};

const BARE_I18N_KEY_RE =
  /^[a-zA-Z0-9_.:-]+$/;

function looksLikeBareI18nKey(
  value: string,
) {
  const trimmed = value.trim();

  return (
    trimmed.length > 0 &&
    trimmed.includes(".") &&
    !trimmed.includes(" ") &&
    BARE_I18N_KEY_RE.test(trimmed)
  );
}

function resolveLearnerText(
  value: unknown,
  tagged: ReturnType<typeof useTaggedT>,
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return "";
  }

  const rawValue = value.trim();
  const taggedResolved = tagged.resolve(
    rawValue,
    {},
    rawValue,
  );

  if (taggedResolved !== rawValue) {
    return String(taggedResolved).trim();
  }

  if (looksLikeBareI18nKey(rawValue)) {
    return String(
      tagged.raw(rawValue, rawValue),
    ).trim();
  }

  return rawValue;
}

/**
 * Render only the authored exercise prompt.
 *
 * Exercise titles are owned by their surrounding learner surface (for example,
 * standalone practice headers or real project cards). Rendering exercise.title
 * here duplicates assessment/quiz headings because this compatibility helper
 * is also used inside the Student review lesson player.
 *
 * Keep validation metadata and hints separate.
 */
export function ExercisePrompt({
  exercise,
}: {
  exercise: LearnerFacingExercise;
}) {
  const tagged = useTaggedT();

  const prompt = resolveLearnerText(
    exercise?.prompt,
    tagged,
  );

  if (!prompt) {
    return null;
  }

  return (
    <MathMarkdown
      className={[
        "text-sm ui-text-muted",
        "[&_.katex]:text-[rgb(var(--ui-text)/0.96)]",
        "[&_.katex-display]:overflow-x-auto",
        "[&_.katex-display]:py-2",
      ].join(" ")}
      content={normalizeMath(prompt)}
    />
  );
}
