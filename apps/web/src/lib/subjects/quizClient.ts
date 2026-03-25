import type {ReviewQuizSpec, ReviewProjectSpec, PurposeMode, PurposePolicy} from "@/lib/subjects/types";

type AnySpec = ReviewQuizSpec | ReviewProjectSpec| any;

function bool01(v: any) { return v ? 1 : 0; }
function norm(v: any) { return String(v ?? "").trim(); }

// tiny stable hash
function fnv1aBase36(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function projectStepsSig(spec: ReviewProjectSpec) {
  return spec.steps
      .map((s) =>
          [
            `id=${norm(s.id)}`,
            `topic=${norm(s.topic)}`,
            `title=${norm(s.title)}`,
            `diff=${norm(s.difficulty)}`,
            `preferKind=${norm(s.preferKind)}`,
            `maxAttempts=${norm(s.maxAttempts)}`,
            `exerciseKey=${norm(s.exerciseKey)}`,
            `seedPolicy=${norm(s.seedPolicy)}`,
            `carry=${bool01(s.carryFromPrev)}`,
          ].join(",")
      )
      .join("::");
}

export function buildReviewQuizKey(
    spec: AnySpec,
    quizCardId: string,
    version: string | number = 1
) {
  const isProject = (spec as any)?.mode === "project";
  const allowReveal = bool01((spec as any).allowReveal);

  const base = [
    "review-quiz",
    `subject=${spec.subject}`,
    `module=${(spec as any).module ?? ""}`,
    `section=${(spec as any).section ?? ""}`,
    // quiz-only fields:
    `topic=${!isProject ? ((spec as any).topic ?? "") : ""}`,
    `difficulty=${!isProject ? ((spec as any).difficulty ?? "") : ""}`,
    `n=${!isProject ? ((spec as any).n ?? 4) : ""}`,
    `allowReveal=${allowReveal}`,
    `preferKind=${!isProject ? ((spec as any).preferKind ?? "") : ""}`,
    `maxAttempts=${(spec as any).maxAttempts ?? 1}`,
    `quizCard=${quizCardId}`,
    `v=${version}`,
  ].filter((x) => !x.endsWith("=")).join("|");

  if (!isProject) return base;

  const stepsHash = fnv1aBase36(projectStepsSig(spec as ReviewProjectSpec));
  return `${base}|mode=project|steps=${stepsHash}`;
}



export function coercePurposeMode(v: any): PurposeMode | null {
    const s = String(v ?? "").trim();
    return s === "quiz" || s === "project" || s === "mixed" ? (s as PurposeMode) : null;
}

export function coercePurposePolicy(v: any): PurposePolicy | null {
    const s = String(v ?? "").trim();
    return s === "strict" || s === "fallback" ? (s as PurposePolicy) : null;
}