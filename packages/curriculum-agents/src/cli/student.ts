import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  resolve,
} from "node:path";

import {
  runStudentAgent,
} from "../student/runStudentAgent.js";
import {
  capPartialStudentRun,
  DEFAULT_MAX_CONTINUATION_PASSES,
  mergeStudentRunReports,
  shouldContinueStudentRun,
} from "../student/continuationPolicy.js";


type CliOptions = {
  url?: string;
  scope?: string;
  headed: boolean;
  storageState?: string;
  allowedOrigins: string[];
  maxTurns: number;
  model?: string;
  report?: string;
};

function usage(): string {
  return [
    "ZoeSkoul Student curriculum agent",
    "",
    "Usage:",
    "  pnpm curriculum:agent:student -- --url <learner-url> [options]",
    "",
    "Options:",
    "  --url <url>                 Required learner-facing Student URL",
    "  --scope <text>              Optional course/module stopping scope",
    "  --headed                    Show the Chromium window",
    "  --storage-state <path>      Authenticated Playwright storage-state JSON",
    "  --allow-origin <origin>     Additional navigation origin; repeatable",
    "  --max-turns <number>        Agent safety limit (default 200)",
    "  --model <model>             Override model (default gpt-5.6)",
    "  --report <path>             JSON report output path",
    "  --help                      Show this help",
    "",
    "Environment:",
    "  OPENAI_API_KEY              Required by the OpenAI Agents SDK",
    "  ZOESKOUL_STUDENT_AGENT_MODEL Optional model fallback",
  ].join("\n");
}

function requireValue(
  args: string[],
  index: number,
  flag: string,
): string {
  const value = args[index + 1];

  if (
    !value ||
    value.startsWith("--")
  ) {
    throw new Error(
      `${flag} requires a value`,
    );
  }

  return value;
}

function parseArgs(
  args: string[],
): CliOptions {
  const options: CliOptions = {
    headed: false,
    allowedOrigins: [],
    maxTurns: 200,
  };

  for (
    let i = 0;
    i < args.length;
    i += 1
  ) {
    const arg = args[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help") {
      console.log(usage());
      process.exit(0);
    }

    if (arg === "--headed") {
      options.headed = true;
      continue;
    }

    if (arg === "--url") {
      options.url =
        requireValue(
          args,
          i,
          arg,
        );
      i += 1;
      continue;
    }

    if (arg === "--scope") {
      options.scope =
        requireValue(
          args,
          i,
          arg,
        );
      i += 1;
      continue;
    }

    if (arg === "--storage-state") {
      options.storageState =
        requireValue(
          args,
          i,
          arg,
        );
      i += 1;
      continue;
    }

    if (arg === "--allow-origin") {
      options.allowedOrigins.push(
        requireValue(
          args,
          i,
          arg,
        ),
      );
      i += 1;
      continue;
    }

    if (arg === "--max-turns") {
      const value = Number(
        requireValue(
          args,
          i,
          arg,
        ),
      );

      if (
        !Number.isInteger(value) ||
        value < 1
      ) {
        throw new Error(
          "--max-turns must be a positive integer",
        );
      }

      options.maxTurns = value;
      i += 1;
      continue;
    }

    if (arg === "--model") {
      options.model =
        requireValue(
          args,
          i,
          arg,
        );
      i += 1;
      continue;
    }

    if (arg === "--report") {
      options.report =
        requireValue(
          args,
          i,
          arg,
        );
      i += 1;
      continue;
    }

    throw new Error(
      `Unknown option: ${arg}`,
    );
  }

  return options;
}

function defaultReportPath(): string {
  const timestamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

  return resolve(
    process.cwd(),
    ".curriculum-reviews",
    "student",
    `${timestamp}.json`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(
    process.argv.slice(2),
  );

  if (!options.url) {
    console.error(usage());
    throw new Error("--url is required");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required",
    );
  }

  const originalScope =
    options.scope?.trim() ?? "";

  let currentStartUrl =
    options.url;
  let continuationPass = 0;
  let report:
    Awaited<
      ReturnType<typeof runStudentAgent>
    > | null = null;

  while (true) {
    const currentScope =
      continuationPass === 0
        ? originalScope || undefined
        : [
            originalScope,
            "",
            "CONTINUATION REQUIREMENT:",
            "This is an automatic continuation of the same learner review.",
            "Resume from the exact current URL and saved ZoeSkoul progress.",
            "Stay with the exact course named in the original scope; do not substitute another enrolled course.",
            "If exact-course enrollment or acquisition is still unfinished, use the learner-visible Catalogs flow to find and enroll/start that exact course before doing coursework.",
            "Seeing unrelated enrolled courses is not a blocker and is never a reason to enter one of them.",
            "Do not redo completed work unless ZoeSkoul requires it.",
            "Do not stop merely because another module has started.",
            "Keep progressing until the requested scope is complete or a genuine learner-visible blocker prevents progress.",
          ]
            .filter(Boolean)
            .join("\n");

    const passReport =
      await runStudentAgent({
        startUrl: currentStartUrl,
        scope: currentScope,
        headed: options.headed,
        storageStatePath:
          options.storageState
            ? resolve(
                options.storageState,
              )
            : undefined,
        additionalAllowedOrigins:
          options.allowedOrigins,
        maxTurns:
          options.maxTurns,
        model:
          options.model,
      });

    report =
      mergeStudentRunReports(
        report,
        passReport,
      );

    if (
      !shouldContinueStudentRun(
        passReport,
        continuationPass,
        DEFAULT_MAX_CONTINUATION_PASSES,
      )
    ) {
      break;
    }

    continuationPass += 1;
    currentStartUrl =
      passReport.endUrl;

    console.log(
      `[student-agent] partial pass ${continuationPass}; continuing from ${currentStartUrl}`,
    );
  }

  if (!report) {
    throw new Error(
      "Student Agent produced no report.",
    );
  }

  report =
    capPartialStudentRun(
      report,
      DEFAULT_MAX_CONTINUATION_PASSES,
    );

  const reportPath = resolve(
    options.report ??
      defaultReportPath(),
  );

  await mkdir(
    dirname(reportPath),
    {
      recursive: true,
    },
  );

  await writeFile(
    reportPath,
    `${JSON.stringify(
      report,
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        status:
          report.status,
        findings:
          report.findings.length,
        exercisesAttempted:
          report.exercisesAttempted,
        quizzesAttempted:
          report.quizzesAttempted,
        projectStepsAttempted:
          report.projectStepsAttempted,
        checkAnswerClicks:
          report.browserEvidence
            ?.checkAnswerClicks ??
          0,
        runClicks:
          report.browserEvidence
            ?.runClicks ??
          0,
        revealClicks:
          report.browserEvidence
            ?.revealClicks ??
          0,
        continuationPasses:
          continuationPass,
        reportPath,
      },
      null,
      2,
    ),
  );
}

main().catch(
  (error: unknown) => {
    const message =
      error instanceof Error
        ? error.stack ??
          error.message
        : String(error);

    console.error(message);
    process.exitCode = 1;
  },
);
