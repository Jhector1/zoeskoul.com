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
  "Vite student launches and validates a protected simple quiz",
  async ({ page }) => {
    test.setTimeout(180_000);

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

    let ready: LaunchCandidate | null =
      null;
    let unsupported:
      | JsonResult
      | null = null;

    const diagnostics: Array<{
      subjectSlug: string;
      moduleSlug: string;
      cardId: string;
      status: number;
      reason: unknown;
    }> = [];

    // Keep discovery bounded. Once a supported launch is found,
    // the real browser repeats that exact request below.
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
            targetRef,
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

        diagnostics.push({
          subjectSlug:
            item.targetRef.subjectSlug,
          moduleSlug:
            item.targetRef.moduleSlug,
          cardId:
            item.targetRef.target
              .ownerCardId,
          status:
            item.response.status,
          reason,
        });

        if (
          item.response.status === 409 &&
          reason ===
            "requires_exact_single_exercise" &&
          unsupported === null
        ) {
          unsupported = item.response;
        }

        if (
          item.response.status === 200 &&
          isRecord(item.response.body)
        ) {
          ready = {
            ...item.targetRef,
            launch:
              item.response.body,
          };
          break;
        }
      }

      if (ready) break;
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

    expect(
      ready,
      "No exact single-exercise simple quiz " +
        "was available in the first 48 quiz targets.\n" +
        "Gateway scan:\n" +
        JSON.stringify(
          diagnostics,
          null,
          2,
        ),
    ).not.toBeNull();

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

    expect([
      "single_choice",
      "multi_choice",
      "numeric",
    ]).toContain(exercise.kind);

    const answer =
      answerForExercise(exercise);
    const submissionId =
      randomUUID();

    const validation = await browserJson(
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
        body: {
          key: launch.key,
          answer,
          submissionId,
        },
      },
    );

    expect(validation.status).toBe(200);
    expect(
      collectForbiddenPaths(
        validation.body,
      ),
    ).toEqual([]);
    expect(validation.body).toMatchObject({
      finalized: expect.any(Boolean),
      duplicate: false,
      sessionComplete: expect.any(Boolean),
    });

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
        body: {
          key: launch.key,
          answer,
          submissionId,
        },
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
  },
);
