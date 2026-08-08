"use client";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import { useTaggedT } from "@student/i18n/tagged";
import { normalizeMath } from "@/lib/markdown/normalizeMath";
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
 * The original KindHelper displayed only exercise.prompt.
 *
 * Standalone practice has a separate page header for exercise.title, but the
 * review lesson card does not. In the Vite lesson player that left learners
 * seeing only short text such as "Define the function before you call it."
 * while the authored task title ("Define and call greet") was omitted.
 *
 * Keep validation metadata and hints separate. Display only the two authored
 * learner-facing fields: title and prompt.
 */
export function ExercisePrompt({
  exercise,
}: {
  exercise: LearnerFacingExercise;
}) {
  const tagged = useTaggedT();

  const title = resolveLearnerText(
    exercise?.title,
    tagged,
  );
  const prompt = resolveLearnerText(
    exercise?.prompt,
    tagged,
  );

  if (!title && !prompt) {
    return null;
  }

  return (
    <div
      className="space-y-2"
      data-testid="exercise-prompt"
    >
      {title ? (
        <MathMarkdown
          className={[
            "ui-title-sm",
            "text-[rgb(var(--ui-text)/0.96)]",
            "[&_.katex-display]:overflow-x-auto",
          ].join(" ")}
          content={normalizeMath(title)}
        />
      ) : null}

      {prompt && prompt !== title ? (
        <MathMarkdown
          className={[
            "text-sm ui-text-muted",
            "[&_.katex]:text-[rgb(var(--ui-text)/0.96)]",
            "[&_.katex-display]:overflow-x-auto",
            "[&_.katex-display]:py-2",
          ].join(" ")}
          content={normalizeMath(prompt)}
        />
      ) : null}
    </div>
  );
}
