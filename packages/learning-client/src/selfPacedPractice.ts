export type SelfPacedPracticeStartInput = {
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
  returnTo?: string | null;
};

export type SelfPacedPracticeStartResult = {
  practiceRunId: string;
  practiceRunStartedAt: string;
  subjectSlug: string;
  moduleSlug: string;
  targetCount: number | null;
  resumed: false;
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

function practiceStartError(status: number, data: unknown) {
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

/**
 * Navigation-only safe re-entry used by billing success.
 *
 * This does not own Practice progress or create a queue. Once entitlement is
 * refreshed, the Daily entry surface calls startSelfPacedPractice for exactly
 * this learner + module and the canonical DB history remains unchanged.
 */
export function buildSelfPacedPracticeContinuationEntryHref(args: {
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const locale = requiredText(args.locale, "locale");
  const subjectSlug = requiredText(args.subjectSlug, "subjectSlug");
  const moduleSlug = requiredText(args.moduleSlug, "moduleSlug");
  const qs = new URLSearchParams({
    subject: subjectSlug,
    module: moduleSlug,
    continue: "practice",
  });
  return `/${encodeURIComponent(locale)}/practice/daily?${qs.toString()}`;
}

export function buildSelfPacedPracticeHref(args: {
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
  practiceRunId: string;
  practiceRunStartedAt: string;
  returnTo?: string | null;
}) {
  const locale = requiredText(args.locale, "locale");
  const subjectSlug = requiredText(args.subjectSlug, "subjectSlug");
  const moduleSlug = requiredText(args.moduleSlug, "moduleSlug");
  const practiceRunId = requiredText(args.practiceRunId, "practiceRunId");
  const practiceRunStartedAt = requiredText(
    args.practiceRunStartedAt,
    "practiceRunStartedAt",
  );
  const returnTo = optionalText(args.returnTo);

  const qs = new URLSearchParams({
    mode: "practice",
    preferPurpose: "practice",
    purposePolicy: "strict",
    practiceRunId,
    practiceRunStartedAt,
  });
  if (returnTo) qs.set("returnTo", returnTo);

  return (
    `/${encodeURIComponent(locale)}` +
    `/subjects/${encodeURIComponent(subjectSlug)}` +
    `/modules/${encodeURIComponent(moduleSlug)}` +
    `/practice?${qs.toString()}`
  );
}

/**
 * The one normal self-paced Practice entrypoint.
 *
 * Header and Lesson/Review submit exactly the same learner + module scope.
 * `returnTo` is navigation metadata only. No section/topic/count namespace is
 * allowed to change canonical normal Practice membership.
 *
 * This function never creates or resumes a normal PracticeSession row.
 * `practiceRunId` is URL-only run identity; learner progress is canonical DB
 * history keyed by learner + module + authored exercise identity.
 */
export async function startSelfPacedPractice(
  args: SelfPacedPracticeStartInput,
  options: SelfPacedPracticeStartOptions = {},
): Promise<SelfPacedPracticeStartResult> {
  const locale = requiredText(args.locale, "locale");
  const subjectSlug = requiredText(args.subjectSlug, "subjectSlug");
  const moduleSlug = requiredText(args.moduleSlug, "moduleSlug");
  const returnTo = optionalText(args.returnTo);
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl("/api/practice/start", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locale,
      subjectSlug,
      moduleSlug,
      ...(returnTo ? { returnTo } : {}),
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw practiceStartError(response.status, data);

  const record =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const practiceRunId = optionalText(record?.practiceRunId);
  const practiceRunStartedAt = optionalText(record?.practiceRunStartedAt);
  const experienceMode = optionalText(record?.experienceMode);

  if (!practiceRunId || !practiceRunStartedAt || experienceMode !== "practice") {
    throw new Error("Practice start did not return a canonical self-paced run.");
  }

  const resolvedSubjectSlug = optionalText(record?.subjectSlug) ?? subjectSlug;
  const resolvedModuleSlug = optionalText(record?.moduleSlug) ?? moduleSlug;
  const resolvedTargetCount = optionalPositiveInt(record?.targetCount);
  const returnUrl = optionalText(record?.returnUrl) ?? returnTo;

  return {
    practiceRunId,
    practiceRunStartedAt,
    subjectSlug: resolvedSubjectSlug,
    moduleSlug: resolvedModuleSlug,
    targetCount: resolvedTargetCount,
    resumed: false,
    returnUrl,
    href: buildSelfPacedPracticeHref({
      locale,
      subjectSlug: resolvedSubjectSlug,
      moduleSlug: resolvedModuleSlug,
      practiceRunId,
      practiceRunStartedAt,
      returnTo: returnUrl,
    }),
  };
}
