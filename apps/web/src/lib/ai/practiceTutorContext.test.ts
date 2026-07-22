import { describe, expect, it } from "vitest";

import {
  buildPracticeTutorDiagnosticContext,
  resolvePracticeTutorDomain,
} from "./practiceTutorContext";

describe("practice tutor diagnostic context", () => {
  it("builds SQL context with starter files and the private expected solution", () => {
    const context = buildPracticeTutorDiagnosticContext({
      title: "List customers",
      prompt: "Write the query in query.sql.",
      kind: "code_input",
      topicSlug: "sql-filtering",
      publicPayload: {
        language: "sql",
        fixedSqlDialect: "sqlite",
        starterFiles: [
          { path: "schema.sql", content: "CREATE TABLE customers (...);" },
          { path: "query.sql", content: "-- write your query" },
        ],
        options: ["customers", "orders"],
        solutionCode: "legacy leaked solution",
      },
      secretPayload: {
        expected: {
          language: "sql",
          solutionCode: "SELECT full_name FROM customers;",
          tests: [{ compareTo: "solution" }],
        },
      },
      userAnswer: {
        kind: "code_input",
        code: "SELECT name FROM customers;",
      },
      failureContext: { feedbackMessage: "The result columns do not match." },
      recentAttempts: [],
    });

    expect(context.domain).toBe("sql");
    expect(context.starterState.starterFiles).toHaveLength(2);
    expect((context.learnerVisibleContext as any).options).toEqual([
      "customers",
      "orders",
    ]);
    expect((context.learnerVisibleContext as any).solutionCode).toBeUndefined();
    expect((context.privateReference.expected as any).solutionCode).toContain(
      "full_name",
    );
  });

  it("builds terminal context from expectations without hardcoding a course", () => {
    expect(
      resolvePracticeTutorDomain({
        kind: "code_input",
        publicPayload: { language: "bash", recipeType: "shell_task" },
        expected: {
          workspaceExpectations: {
            requiredFiles: ["events.txt"],
          },
        },
        userAnswer: {
          terminalEvidence: { commands: ["git mv schedule.txt events.txt"] },
        },
      }),
    ).toBe("terminal");
  });

  it("keeps Python multi-file starter and solution state while redacting credentials", () => {
    const context = buildPracticeTutorDiagnosticContext({
      title: "Build a report",
      prompt: "Complete the report functions.",
      kind: "code_input",
      topicSlug: "python-functions",
      publicPayload: {
        language: "python",
        starterFiles: [
          { path: "main.py", content: "from reports import build_report" },
          { path: "reports.py", content: "def build_report(rows):\n    pass" },
        ],
      },
      secretPayload: {
        expected: {
          solutionFiles: [
            { path: "reports.py", content: "def build_report(rows):\n    return len(rows)" },
          ],
          semanticChecks: [{ kind: "function", name: "build_report" }],
          apiKey: "do-not-send",
        },
      },
      userAnswer: { files: [{ path: "reports.py", content: "return rows" }] },
      failureContext: { runtimeError: "AssertionError" },
      recentAttempts: [],
    });

    expect(context.domain).toBe("programming");
    expect((context.privateReference.expected as any).solutionFiles).toHaveLength(1);
    expect((context.privateReference.expected as any).apiKey).toBe("[redacted]");
  });
});
