import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

type JsonResult = {
  status: number;
  body: unknown;
  allowOrigin: string | null;
};

type RuntimeTarget = {
  version: 1;
  sectionSlug: string;
  topicSlug: string;
  ownerCardId: string;
  targetKind: "card";
  targetId: string;
  runtimeKind: "quiz";
};

type ModuleRef = {
  subjectSlug: string;
  moduleSlug: string;
};

type TargetRef = ModuleRef & {
  target: RuntimeTarget;
};

type LaunchCandidate = TargetRef & {
  launch: Record<string, unknown>;
  lesson: unknown;
};

type CoveredQuizKind =
  | "single_choice"
  | "multi_choice";

type QuizCoverageCase = {
  expectedKind: CoveredQuizKind;
  subjectSlug: string;
  moduleSlug: string;
  topicSlug: string;
  correctOptionIds: readonly string[];
};

const quizCoverageCases: readonly QuizCoverageCase[] = [
  {
    expectedKind: "single_choice",
    subjectSlug: "python-v2",
    moduleSlug: "python-v2-0",
    topicSlug: "what-python-is",
    correctOptionIds: ["b"],
  },
  {
    expectedKind: "multi_choice",
    subjectSlug: "applied-python-projects",
    moduleSlug:
      "python-8-object-oriented-foundations",
    topicSlug:
      "class-files-and-instances",
    correctOptionIds: ["a", "c"],
  },
];

type LessonCardSnapshot = {
  id: string;
  type: string | null;
  runtimeKind: string | null;
};

const websiteOrigin =
  process.env.E2E_WEBSITE_ORIGIN ??
  "http://localhost:3000";
const studentOrigin =
  process.env.E2E_STUDENT_ORIGIN ??
  "http://localhost:3002";

const subjectSlugs = [
  "python",
  "python-v2",
  "python-data-functions",
  "applied-python-projects",
  "sql",
  "sql-v2",
  "sql-data-management",
  "sql-analysis-reporting",
  "multi-table-sql",
  "git-foundations",
  "linux-terminal-fundamentals",
  "c-data-structures",
  "c-runtime-analysis-asymptotics",
] as const;

const forbiddenFields = new Set([
  "answerKey",
  "checkSql",
  "correctAnswer",
  "expected",
  "expectedAnswerPayload",
  "expectedSolution",
  "hiddenTests",
  "recipe",
  "revealAnswer",
  "secretPayload",
  "solutionCode",
  "solutionFiles",
  "sourceChecks",
  "spec",
  "starterCode",
  "starterFiles",
  "tests",
  "tryIt",
  "workspace",
]);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function collectForbiddenPaths(
  value: unknown,
  path = "$",
  out: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectForbiddenPaths(
        item,
        `${path}[${index}]`,
        out,
      );
    });
    return out;
  }

  if (!isRecord(value)) return out;

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;

    if (forbiddenFields.has(key)) {
      out.push(nestedPath);
    }

    collectForbiddenPaths(
      nested,
      nestedPath,
      out,
    );
  }

  return out;
}

function collectQuizTargets(
  value: unknown,
  out: RuntimeTarget[] = [],
  seen = new Set<string>(),
): RuntimeTarget[] {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      collectQuizTargets(item, out, seen);
    });
    return out;
  }

  if (!isRecord(value)) return out;

  const sectionSlug =
    typeof value.sectionSlug === "string"
      ? value.sectionSlug
      : null;
  const topicSlug =
    typeof value.topicSlug === "string"
      ? value.topicSlug
      : null;
  const ownerCardId =
    typeof value.ownerCardId === "string"
      ? value.ownerCardId
      : null;
  const targetId =
    typeof value.targetId === "string"
      ? value.targetId
      : null;

  const targetLooksValid =
    value.version === 1 &&
    sectionSlug !== null &&
    topicSlug !== null &&
    ownerCardId !== null &&
    value.targetKind === "card" &&
    targetId !== null &&
    value.runtimeKind === "quiz";

  if (targetLooksValid) {
    const identity = [
      sectionSlug,
      topicSlug,
      ownerCardId,
      targetId,
    ].join("|");

    if (!seen.has(identity)) {
      seen.add(identity);
      out.push({
        version: 1,
        sectionSlug,
        topicSlug,
        ownerCardId,
        targetKind: "card",
        targetId,
        runtimeKind: "quiz",
      });
    }
  }

  Object.values(value).forEach((nested) => {
    collectQuizTargets(
      nested,
      out,
      seen,
    );
  });

  return out;
}

/**
 * derive prerequisite card ids from the learner-safe lesson response
 *
 * This is the same DTO rendered by StudentLessonHost. Never infer card
 * ids from raw manifest positions or synthesized naming conventions.
 */
function lessonCardsBeforeTarget(
  value: unknown,
  target: RuntimeTarget,
): LessonCardSnapshot[] | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = lessonCardsBeforeTarget(
        item,
        target,
      );

      if (found) return found;
    }

    return null;
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.cards)) {
    const targetIndex =
      value.cards.findIndex(
        (card) =>
          isRecord(card) &&
          card.id === target.ownerCardId,
      );

    if (targetIndex >= 0) {
      return value.cards
        .slice(0, targetIndex)
        .flatMap((card) => {
          if (
            !isRecord(card) ||
            typeof card.id !== "string"
          ) {
            return [];
          }

          return [
            {
              id: card.id,
              type:
                typeof card.type === "string"
                  ? card.type
                  : null,
              runtimeKind:
                typeof card.runtimeKind === "string"
                  ? card.runtimeKind
                  : null,
            },
          ];
        });
    }
  }

  for (const nested of Object.values(value)) {
    const found = lessonCardsBeforeTarget(
      nested,
      target,
    );

    if (found) return found;
  }

  return null;
}

async function browserJson(
  page: Page,
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<JsonResult> {
  return page.evaluate(
    async ({
      requestUrl,
      requestInit,
    }) => {
      const response = await fetch(
        requestUrl,
        {
          method:
            requestInit?.method ?? "GET",
          credentials: "include",
          cache: "no-store",
          headers: requestInit?.headers,
          body:
            requestInit?.body === undefined
              ? undefined
              : JSON.stringify(
                  requestInit.body,
                ),
        },
      );

      const text = await response.text();
      let body: unknown = null;

      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }

      return {
        status: response.status,
        body,
        allowOrigin:
          response.headers.get(
            "access-control-allow-origin",
          ),
      };
    },
    {
      requestUrl: url,
      requestInit: init,
    },
  );
}

async function apiJson(
  request: APIRequestContext,
  url: string,
  init?: {
    method?: string;
    body?: unknown;
  },
): Promise<JsonResult> {
  const response = await request.fetch(url, {
    method: init?.method ?? "GET",
    failOnStatusCode: false,
    timeout: 20_000,
    headers: {
      Accept: "application/json",
      Origin: studentOrigin,
      ...(init?.body === undefined
        ? {}
        : {
            "Content-Type":
              "application/json",
          }),
    },
    data: init?.body,
  });

  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    status: response.status(),
    body,
    allowOrigin:
      response.headers()[
        "access-control-allow-origin"
      ] ?? null,
  };
}

async function mapBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (
    let start = 0;
    start < items.length;
    start += batchSize
  ) {
    const batch = items.slice(
      start,
      start + batchSize,
    );

    results.push(
      ...(await Promise.all(
        batch.map(worker),
      )),
    );
  }

  return results;
}

function launchUrl(args: {
  subjectSlug: string;
  moduleSlug: string;
  target: RuntimeTarget;
}): string {
  const search = new URLSearchParams({
    locale: "en",
    version: String(args.target.version),
    sectionSlug:
      args.target.sectionSlug,
    topicSlug:
      args.target.topicSlug,
    ownerCardId:
      args.target.ownerCardId,
    targetKind:
      args.target.targetKind,
    targetId:
      args.target.targetId,
    runtimeKind:
      args.target.runtimeKind,
  });

  return (
    `${websiteOrigin}/api/student/courses/` +
    `${encodeURIComponent(args.subjectSlug)}` +
    `/modules/` +
    `${encodeURIComponent(args.moduleSlug)}` +
    `/runtime/practice?${search.toString()}`
  );
}

function firstOptionId(
  exercise: Record<string, unknown>,
): string {
  const payload = exercise.payload;

  if (!isRecord(payload)) {
    throw new Error(
      "Practice exercise payload is missing.",
    );
  }

  const options = payload.options;

  if (
    !Array.isArray(options) ||
    options.length === 0
  ) {
    throw new Error(
      "Practice exercise has no options.",
    );
  }

  const first = options[0];

  if (typeof first === "string") {
    return first;
  }

  if (
    isRecord(first) &&
    typeof first.id === "string"
  ) {
    return first.id;
  }

  throw new Error(
    "Practice option has no stable id.",
  );
}

function answerForExercise(
  exercise: Record<string, unknown>,
) {
  if (exercise.kind === "single_choice") {
    return {
      kind: "single_choice",
      optionId: firstOptionId(exercise),
    };
  }

  if (exercise.kind === "multi_choice") {
    return {
      kind: "multi_choice",
      optionIds: [
        firstOptionId(exercise),
      ],
    };
  }

  if (exercise.kind === "numeric") {
    return {
      kind: "numeric",
      value: 0,
    };
  }

  throw new Error(
    `Unexpected migrated practice kind: ` +
      `${String(exercise.kind)}`,
  );
}

test.describe.configure({
  mode: "serial",
});

test(
  "Vite student renders, validates, and persists protected simple quizzes",
  async ({ page }) => {
    test.setTimeout(360_000);

    await page.goto("/learning", {
      waitUntil: "domcontentloaded",
    });

    expect(new URL(page.url()).origin).toBe(
      studentOrigin,
    );

    const session = await browserJson(
      page,
      `${websiteOrigin}/api/app-session`,
    );

    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({
      authenticated: true,
      user: {
        email:
          "playwright.student.runtime@zoeskoul.local",
      },
    });

    // A successful browser fetch from the Vite origin proves that the
    // browser accepted the CORS response. Browser JavaScript does not expose
    // Access-Control-Allow-Origin as a readable response header, so inspect
    // that raw header separately through Playwright's request context.
    const sessionCors = await apiJson(
      page.request,
      `${websiteOrigin}/api/app-session`,
    );

    expect(sessionCors.status).toBe(200);
    expect(sessionCors.allowOrigin).toBe(
      studentOrigin,
    );

    const courseResults = await Promise.all(
      subjectSlugs.map(
        async (subjectSlug) => ({
          subjectSlug,
          response: await apiJson(
            page.request,
            `${websiteOrigin}/api/student/courses/` +
              `${encodeURIComponent(subjectSlug)}` +
              "?locale=en",
          ),
        }),
      ),
    );

    const modules: ModuleRef[] = [];

    for (const result of courseResults) {
      if (
        result.response.status !== 200 ||
        !isRecord(result.response.body) ||
        !Array.isArray(
          result.response.body.modules,
        )
      ) {
        continue;
      }

      for (
        const moduleValue of
        result.response.body.modules
      ) {
        if (
          isRecord(moduleValue) &&
          typeof moduleValue.slug === "string"
        ) {
          modules.push({
            subjectSlug:
              result.subjectSlug,
            moduleSlug:
              moduleValue.slug,
          });
        }
      }
    }

    const lessonResults = await mapBatches(
      modules,
      6,
      async (moduleRef) => ({
        ...moduleRef,
        response: await apiJson(
          page.request,
          `${websiteOrigin}/api/student/courses/` +
            `${encodeURIComponent(
              moduleRef.subjectSlug,
            )}` +
            `/modules/` +
            `${encodeURIComponent(
              moduleRef.moduleSlug,
            )}` +
            "/lesson?locale=en",
        ),
      }),
    );

    const targets: TargetRef[] = [];

    for (const result of lessonResults) {
      if (result.response.status !== 200) {
        continue;
      }

      for (
        const target of
        collectQuizTargets(
          result.response.body,
        )
      ) {
        targets.push({
          subjectSlug:
            result.subjectSlug,
          moduleSlug:
            result.moduleSlug,
          target,
        });
      }
    }

    expect(
      targets.length,
      "Expected the authenticated curriculum " +
        "to expose at least one quiz target.",
    ).toBeGreaterThan(0);

    let unsupported:
    | JsonResult
    | null = null;

    /**
     * Preserve one explicit legacy-fallback assertion independently from
     * the deterministic migrated coverage cases below.
     */
    for (
    let start = 0;
    start < Math.min(targets.length, 48);
    start += 6
    ) {
      const batch = targets.slice(
        start,
        start + 6,
      );
      const launched = await Promise.all(
        batch.map(
          async (targetRef) => ({
            response: await apiJson(
              page.request,
              launchUrl(targetRef),
            ),
          }),
        ),
      );

      for (const item of launched) {
        const reason =
          isRecord(item.response.body)
            ? item.response.body.reason
            : null;

        if (
          item.response.status === 409 &&
          reason ===
            "requires_exact_single_exercise"
        ) {
          unsupported = item.response;
          break;
        }
      }

      if (unsupported) break;
    }

    expect(
      unsupported,
      "Expected at least one multi-question " +
        "quiz to remain on the explicit " +
        "RUNTIME_NOT_MIGRATED fallback.",
    ).not.toBeNull();

    expect(unsupported?.body).toMatchObject({
      code: "RUNTIME_NOT_MIGRATED",
      reason:
        "requires_exact_single_exercise",
    });

    const covered = await Promise.all(
      quizCoverageCases.map(
        async (coverageCase) => {
          const targetRef = targets.find(
            (candidate) =>
              candidate.subjectSlug ===
                coverageCase.subjectSlug &&
              candidate.moduleSlug ===
                coverageCase.moduleSlug &&
              (
                candidate.target.topicSlug
                  .split(".")
                  .filter(Boolean)
                  .at(-1) ??
                candidate.target.topicSlug
              ) === coverageCase.topicSlug,
          );

          if (!targetRef) {
            throw new Error(
              "Expected learner-safe lesson target for " +
                `${coverageCase.expectedKind}: ` +
                `${coverageCase.subjectSlug}/` +
                `${coverageCase.moduleSlug}/` +
                `${coverageCase.topicSlug}`,
            );
          }

          const response = await apiJson(
            page.request,
            launchUrl(targetRef),
          );

          expect(
            response.status,
            `Expected ${coverageCase.expectedKind} launch to succeed.`,
          ).toBe(200);
          expect(isRecord(response.body)).toBe(true);
          expect(
            isRecord(response.body) &&
              isRecord(response.body.exercise)
              ? response.body.exercise.kind
              : null,
          ).toBe(coverageCase.expectedKind);

          const lessonResult =
            lessonResults.find(
              (result) =>
                result.subjectSlug ===
                  targetRef.subjectSlug &&
                result.moduleSlug ===
                  targetRef.moduleSlug,
            );

          return {
            coverageCase,
            ready: {
              ...targetRef,
              launch:
                response.body as Record<
                  string,
                  unknown
                >,
              lesson:
                lessonResult?.response.body ??
                null,
            } satisfies LaunchCandidate,
          };
        },
      ),
    );

    for (const coverage of covered) {
      const {
        expectedKind,
        correctOptionIds,
      } = coverage.coverageCase;
      const ready = coverage.ready;

      const browserLaunch = await browserJson(
        page,
        launchUrl(ready!),
      );

      expect(browserLaunch.status).toBe(200);
      expect(
        collectForbiddenPaths(
          browserLaunch.body,
        ),
      ).toEqual([]);
      expect(
        isRecord(browserLaunch.body),
      ).toBe(true);

      const launch =
        browserLaunch.body as Record<
          string,
          unknown
        >;

      expect(typeof launch.key).toBe("string");
      expect(
        String(launch.key).length,
      ).toBeGreaterThanOrEqual(16);
      expect(launch.validationPath).toBe(
        "/api/student/runtime/practice/validate",
      );
      expect(isRecord(launch.exercise)).toBe(true);

      const exercise =
        launch.exercise as Record<
          string,
          unknown
        >;

      expect(exercise.kind).toBe(
        expectedKind,
      );

      const resetProgress = await browserJson(
        page,
        `${websiteOrigin}/api/review/progress?` +
          new URLSearchParams({
            subjectSlug:
              ready!.subjectSlug,
            moduleSlug:
              ready!.moduleSlug,
            locale: "en",
          }).toString(),
        {
          method: "DELETE",
        },
      );

      expect(resetProgress.status).toBe(200);
      expect(resetProgress.body).toMatchObject({
        ok: true,
      });

      const prerequisiteCards =
        lessonCardsBeforeTarget(
          ready!.lesson,
          ready!.target,
        );

      expect(
        prerequisiteCards,
        "Expected to find the discovered quiz in its learner-safe lesson response.",
      ).not.toBeNull();

      expect(
        prerequisiteCards!.length,
        "Expected the migrated quiz to have prerequisite lesson cards.",
      ).toBeGreaterThan(0);

      const readingPrerequisiteIds =
        prerequisiteCards!
          .filter(
            (card) =>
              card.type !== "runtime" ||
              card.runtimeKind === "sketch",
          )
          .map((card) => card.id);
      const assessmentPrerequisiteIds =
        prerequisiteCards!
          .filter(
            (card) =>
              card.type === "runtime" &&
              (
                card.runtimeKind === "quiz" ||
                card.runtimeKind === "project"
              ),
          )
          .map((card) => card.id);

      const readingPrerequisiteDone =
        Object.fromEntries(
          readingPrerequisiteIds.map(
            (cardId) => [cardId, true],
          ),
        );
      const assessmentPrerequisiteDone =
        Object.fromEntries(
          assessmentPrerequisiteIds.map(
            (cardId) => [cardId, true],
          ),
        );
      const canonicalTopicKey =
        ready!.target.topicSlug
          .split(".")
          .filter(Boolean)
          .at(-1) ??
        ready!.target.topicSlug;

      const seededProgress =
        await browserJson(
          page,
          `${websiteOrigin}/api/review/progress`,
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: {
              subjectSlug:
                ready!.subjectSlug,
              moduleSlug:
                ready!.moduleSlug,
              locale: "en",
              state: {
                activeTopicId:
                  canonicalTopicKey,
                moduleCompleted: false,
                topics: {
                  [canonicalTopicKey]: {
                    completed: false,
                    readingDone:
                      readingPrerequisiteDone,
                    cardsDone:
                      readingPrerequisiteDone,
                    quizzesDone:
                      assessmentPrerequisiteDone,
                  },
                },
                __saveRevision:
                  Date.now(),
              },
            },
          },
        );

      expect(seededProgress.status).toBe(200);

      /**
       * Verify that the exact learner-safe prerequisite card ids survive
       * PUT -> GET before StudentLessonHost hydrates the lesson.
       */
      const restoredProgress =
        await browserJson(
          page,
          `${websiteOrigin}/api/review/progress?` +
            new URLSearchParams({
              subjectSlug:
                ready!.subjectSlug,
              moduleSlug:
                ready!.moduleSlug,
              locale: "en",
            }).toString(),
        );

      expect(restoredProgress.status).toBe(200);
      expect(isRecord(restoredProgress.body)).toBe(true);

      const restoredState =
        isRecord(restoredProgress.body) &&
        isRecord(
          restoredProgress.body.progress,
        )
          ? restoredProgress.body.progress
          : null;

      expect(
        restoredState,
        "Expected review-progress GET to return the seeded state.",
      ).not.toBeNull();

      const restoredTopics =
        isRecord(restoredState) &&
        isRecord(restoredState.topics)
          ? restoredState.topics
          : null;
      const restoredTopic =
        restoredTopics &&
        isRecord(
          restoredTopics[
            canonicalTopicKey
          ],
        )
          ? restoredTopics[
              canonicalTopicKey
            ]
          : null;

      expect(
        restoredTopic,
        `Expected restored topic ${canonicalTopicKey}.`,
      ).not.toBeNull();

      const restoredReadingDone =
        restoredTopic &&
        isRecord(restoredTopic.readingDone)
          ? restoredTopic.readingDone
          : null;
      const restoredCardsDone =
        restoredTopic &&
        isRecord(restoredTopic.cardsDone)
          ? restoredTopic.cardsDone
          : null;

      for (const cardId of readingPrerequisiteIds) {
        expect(
          restoredReadingDone?.[cardId],
          `Expected readingDone[${cardId}] after PUT -> GET.`,
        ).toBe(true);
        expect(
          restoredCardsDone?.[cardId],
          `Expected cardsDone[${cardId}] after PUT -> GET.`,
        ).toBe(true);
      }

      const lessonUrl =
        `/courses/${encodeURIComponent(
          ready!.subjectSlug,
        )}` +
        `/modules/${encodeURIComponent(
          ready!.moduleSlug,
        )}/learn`;

      await page.goto(lessonUrl, {
        waitUntil: "domcontentloaded",
      });

      expect(new URL(page.url()).origin).toBe(
        studentOrigin,
      );

      const lessonContentCard =
        page.getByTestId(
          "lesson-content-card",
        );

      await expect(
        lessonContentCard,
      ).toBeVisible();

      const visibleCardId =
        await lessonContentCard.getAttribute(
          "data-card-id",
        );

      expect(
        visibleCardId,
        "Expected the lesson to open on the first prerequisite card.",
      ).toBe(prerequisiteCards![0]?.id);

      await expect(
        page.getByTestId(
          "lesson-card-status",
        ),
        `Expected StudentLessonHost to hydrate completion for ${String(
          visibleCardId,
        )}.`,
      ).toHaveText("Complete");

      const quiz = page.getByTestId(
        "student-simple-quiz",
      );
      const nextButton = page.getByTestId(
        "lesson-next-button",
      );

      for (
        let step = 0;
        step < 32;
        step += 1
      ) {
        const currentCardId =
          await lessonContentCard.getAttribute(
            "data-card-id",
          );

        /**
         * Break as soon as the semantic target card is active.
         * The quiz component may still be mounting, while its Next button is
         * already correctly disabled until the learner answers.
         */
        if (
          currentCardId ===
            ready!.target.ownerCardId ||
          await quiz
            .isVisible()
            .catch(() => false)
        ) {
          break;
        }

        const completionButton =
          page.getByRole("button", {
            name: /Mark as read|Mark watched/,
          });

        if (
          await completionButton
            .isVisible()
            .catch(() => false)
        ) {
          await completionButton.click();
        }

        await expect(nextButton).toBeEnabled();
        await nextButton.click();

        /**
         * Wait for the visible card to change before checking the next step.
         * The destination can be the migrated quiz, whose Next button is
         * correctly disabled until the learner answers it.
         */
        await expect
          .poll(
            async () => {
              if (
                await quiz
                  .isVisible()
                  .catch(() => false)
              ) {
                return "quiz";
              }

              const nextCardId =
                await lessonContentCard.getAttribute(
                  "data-card-id",
                );

              return (
                nextCardId &&
                nextCardId !== currentCardId
                  ? nextCardId
                  : null
              );
            },
            {
              message:
                "Expected Next to display a different lesson card.",
            },
          )
          .not.toBeNull();
      }

      await expect(
        lessonContentCard,
      ).toHaveAttribute(
        "data-card-id",
        ready!.target.ownerCardId,
      );
      await expect(quiz).toBeVisible();
      await expect(quiz).toHaveAttribute(
        "data-owner-card-id",
        ready!.target.ownerCardId,
      );
      await expect(quiz).toHaveAttribute(
        "data-exercise-kind",
        expectedKind,
      );

      const inputType =
        expectedKind === "single_choice"
          ? "radio"
          : "checkbox";
      const visibleOptions =
        quiz.locator(
          `input[type="${inputType}"]`,
        );
      const optionCount =
        await visibleOptions.count();

      expect(
        optionCount,
        `The migrated ${expectedKind} quiz must expose learner-visible options.`,
      ).toBeGreaterThan(0);

      const progressSaveStatuses:
        number[] = [];

      page.on("response", (response) => {
        const request = response.request();
        const url = new URL(response.url());

        if (
          request.method() === "PUT" &&
          url.origin === websiteOrigin &&
          url.pathname ===
            "/api/review/progress"
        ) {
          progressSaveStatuses.push(
            response.status(),
          );
        }
      });

      const visibleOptionIds =
      await visibleOptions.evaluateAll(
          (nodes) =>
            nodes.flatMap((node) => {
              const optionId =
                node.getAttribute(
                  "data-option-id",
                );
              return optionId
                ? [optionId]
                : [];
            }),
        );

      expect(
        visibleOptionIds,
      ).toEqual(
        expect.arrayContaining([
          ...correctOptionIds,
        ]),
      );

      const setVisibleAnswer = async (
        optionIds: readonly string[],
      ) => {
        if (expectedKind === "multi_choice") {
          for (
            let index = 0;
            index < optionCount;
            index += 1
          ) {
            const option =
              visibleOptions.nth(index);
            if (await option.isChecked()) {
              await option.uncheck();
            }
          }
        }

        for (const optionId of optionIds) {
          await quiz
            .locator(
              `input[data-option-id="${optionId}"]`,
            )
            .check();
        }
      };

      const submitVisibleAnswer = async () => {
        const validationResponsePromise =
          page.waitForResponse(
            (response) => {
              const request =
                response.request();
              const url =
                new URL(response.url());

              return (
                request.method() ===
                  "POST" &&
                url.origin ===
                  websiteOrigin &&
                url.pathname ===
                  "/api/student/runtime/practice/validate"
              );
            },
          );

        await page
          .getByTestId(
            "student-simple-quiz-submit",
          )
          .click();

        const validationResponse =
          await validationResponsePromise;
        expect(
          validationResponse.status(),
        ).toBe(200);

        const validationBody =
          await validationResponse.json();

        expect(
          collectForbiddenPaths(
            validationBody,
          ),
        ).toEqual([]);
        expect(validationBody).toMatchObject({
          finalized: expect.any(Boolean),
          duplicate: false,
          sessionComplete: expect.any(Boolean),
        });

        const posted =
          validationResponse
            .request()
            .postDataJSON();

        expect(isRecord(posted)).toBe(true);

        return {
          body:
            validationBody as Record<
              string,
              unknown
            >,
          posted:
            posted as Record<
              string,
              unknown
            >,
        };
      };

      const wrongOptionIds =
        expectedKind === "single_choice"
          ? [
              visibleOptionIds.find(
                (optionId) =>
                  !correctOptionIds.includes(
                    optionId,
                  ),
              ),
            ].filter(
              (optionId):
                optionId is string =>
                  typeof optionId === "string",
            )
          : [correctOptionIds[0]].filter(
              (optionId):
                optionId is string =>
                  typeof optionId === "string",
            );

      expect(
        wrongOptionIds.length,
        `Expected a safe incorrect ${expectedKind} answer fixture.`,
      ).toBeGreaterThan(0);

      await setVisibleAnswer(
        wrongOptionIds,
      );
      const incorrect =
        await submitVisibleAnswer();

      expect(incorrect.body).toMatchObject({
        ok: false,
      });
      await expect(
        page.getByTestId(
          "student-simple-quiz-feedback",
        ),
      ).toContainText("Try again");

      await setVisibleAnswer(
        correctOptionIds,
      );
      const correct =
        await submitVisibleAnswer();

      expect(correct.body).toMatchObject({
        ok: true,
      });

      const correctValidation =
        correct.body;
      const duplicateRequestBody =
        correct.posted;

      expect(
        correctValidation,
        `Expected the visible ${expectedKind} answer to validate correctly.`,
      ).not.toBeNull();
      expect(
        duplicateRequestBody,
      ).not.toBeNull();

      await expect(
        page.getByTestId(
          "student-simple-quiz-feedback",
        ),
      ).toContainText("Correct");

      await expect(
        page.getByTestId(
          "student-simple-quiz-submit",
        ),
      ).toContainText("Complete");

      await expect(
        page.getByTestId(
          "lesson-card-status",
        ),
      ).toHaveText("Complete");

      await expect(nextButton).toBeEnabled();

      await expect
        .poll(
          () =>
            progressSaveStatuses.some(
              (status) => status === 200,
            ),
          {
            message:
              "Expected the visible correct answer to persist review progress.",
          },
        )
        .toBe(true);

      await expect
        .poll(
          async () => {
            const progressResult =
              await browserJson(
                page,
                `${websiteOrigin}/api/review/progress?` +
                  new URLSearchParams({
                    subjectSlug:
                      ready!.subjectSlug,
                    moduleSlug:
                      ready!.moduleSlug,
                    locale: "en",
                  }).toString(),
              );

            if (
              progressResult.status !==
                200 ||
              !isRecord(
                progressResult.body,
              ) ||
              !isRecord(
                progressResult.body
                  .progress,
              )
            ) {
              return false;
            }

            const topics =
              progressResult.body
                .progress.topics;

            if (!isRecord(topics)) {
              return false;
            }

            const topic =
              topics[
                canonicalTopicKey
              ];

            return (
              isRecord(topic) &&
              isRecord(
                topic.quizzesDone,
              ) &&
              topic.quizzesDone[
                ready!.target.ownerCardId
              ] === true
            );
          },
          {
            message:
              "Expected quizzesDone to contain the visible runtime card id.",
          },
        )
        .toBe(true);

      const duplicate = await browserJson(
        page,
        `${websiteOrigin}` +
          `${String(
            launch.validationPath,
          )}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            duplicateRequestBody!,
        },
      );

      expect(duplicate.status).toBe(200);
      expect(
        collectForbiddenPaths(
          duplicate.body,
        ),
      ).toEqual([]);
      expect(duplicate.body).toMatchObject({
        duplicate: true,
      });
    }  },
);
