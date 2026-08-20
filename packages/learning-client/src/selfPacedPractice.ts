export type SelfPacedPracticeStartInput = {
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  targetCount?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  returnTo?: string | null;
};

export type SelfPacedPracticeStartResult = {
  sessionId: string;
  subjectSlug: string;
  moduleSlug: string;
  targetCount: number | null;
  resumed: boolean;
  returnUrl: string | null;
  href: string;
};

export type SelfPacedPracticeStartOptions = {
  fetchImpl?: typeof fetch;
};

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required to start Practice.`);
  return text;
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalPositiveInt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function practiceStartError(
  status: number,
  data: unknown,
) {
  const record =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const message =
    optionalText(record?.message) ??
    optionalText(record?.error) ??
    `Could not start Practice (${status}).`;
  const error = new Error(message) as Error & {
    status?: number;
    code?: string;
  };
  error.status = status;
  const code = optionalText(record?.code);
  if (code) error.code = code;
  return error;
}

export function buildSelfPacedPracticeHref(args: {
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
  sessionId: string;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  targetCount?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  returnTo?: string | null;
}) {
  const locale = requiredText(args.locale, "locale");
  const subjectSlug = requiredText(args.subjectSlug, "subjectSlug");
  const moduleSlug = requiredText(args.moduleSlug, "moduleSlug");
  const sessionId = requiredText(args.sessionId, "sessionId");

  const qs = new URLSearchParams({
    sessionId,
    mode: "standard",
    preferPurpose: "practice",
    purposePolicy: "strict",
  });

  const sectionSlug = optionalText(args.sectionSlug);
  const topicSlug = optionalText(args.topicSlug);
  const returnTo = optionalText(args.returnTo);
  const targetCount = optionalPositiveInt(args.targetCount);
  const difficulty = optionalText(args.difficulty);

  if (sectionSlug) qs.set("section", sectionSlug);
  if (topicSlug) qs.set("topic", topicSlug);
  if (targetCount) qs.set("questionCount", String(targetCount));
  if (difficulty) qs.set("difficulty", difficulty);
  if (returnTo) qs.set("returnTo", returnTo);

  return (
    `/${encodeURIComponent(locale)}` +
    `/subjects/${encodeURIComponent(subjectSlug)}` +
    `/modules/${encodeURIComponent(moduleSlug)}` +
    `/practice?${qs.toString()}`
  );
}

/**
 * The single client entrypoint for normal self-paced Practice.
 *
 * Header Practice and Lesson/Review call this exact function. Their only
 * difference is scope:
 * - Lesson/Review supplies module scope.
 * - Header may additionally supply section/topic and targetCount.
 *
 * The returned sessionId is authoritative. The Practice runtime never creates
 * a normal self-paced exercise before this contract succeeds.
 */
export async function startSelfPacedPractice(
  args: SelfPacedPracticeStartInput,
  options: SelfPacedPracticeStartOptions = {},
): Promise<SelfPacedPracticeStartResult> {
  const locale = requiredText(args.locale, "locale");
  const subjectSlug = requiredText(args.subjectSlug, "subjectSlug");
  const moduleSlug = requiredText(args.moduleSlug, "moduleSlug");
  const sectionSlug = optionalText(args.sectionSlug);
  const topicSlug = optionalText(args.topicSlug);
  const returnTo = optionalText(args.returnTo);
  const targetCount = optionalPositiveInt(args.targetCount);
  const difficulty = optionalText(args.difficulty);
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl("/api/practice/session/start", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locale,
      subjectSlug,
      moduleSlug,
      ...(sectionSlug ? { sectionSlug } : {}),
      ...(topicSlug ? { topicSlug } : {}),
      ...(targetCount ? { targetCount } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(returnTo ? { returnTo } : {}),
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw practiceStartError(response.status, data);
  }

  const record =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const sessionId = optionalText(record?.sessionId);
  const experienceMode = optionalText(record?.experienceMode);

  if (!sessionId || experienceMode !== "standard") {
    throw new Error(
      "Practice start did not return an authoritative self-paced session.",
    );
  }

  const resolvedSubjectSlug =
    optionalText(record?.subjectSlug) ?? subjectSlug;
  const resolvedModuleSlug =
    optionalText(record?.moduleSlug) ?? moduleSlug;
  const resolvedTargetCount =
    optionalPositiveInt(record?.targetCount);
  const returnUrl =
    optionalText(record?.returnUrl) ?? returnTo;

  return {
    sessionId,
    subjectSlug: resolvedSubjectSlug,
    moduleSlug: resolvedModuleSlug,
    targetCount: resolvedTargetCount,
    resumed: Boolean(record?.resumed),
    returnUrl,
    href: buildSelfPacedPracticeHref({
      locale,
      subjectSlug: resolvedSubjectSlug,
      moduleSlug: resolvedModuleSlug,
      sessionId,
      sectionSlug,
      topicSlug,
      // Preserve only a learner-selected cap in the URL. The server-owned
      // targetCount remains available through the session status.
      targetCount,
      difficulty:
        difficulty === "easy" ||
        difficulty === "medium" ||
        difficulty === "hard"
          ? difficulty
          : null,
      returnTo: returnUrl,
    }),
  };
}
