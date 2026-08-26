import { describe, expect, it } from "vitest";
import { resolveDeterministicEditorSource } from "@zoeskoul/learning-runtime/review/module/runtime/deterministicEditorSource";

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    ownerKey: "exercise:sql-v2-step",
    ownerKind: "exercise" as const,
    targetKey: "exercise:sql-v2-step",
    toolScopeKey: "exercise:sql-v2-step",
    language: "sql",
    starterFiles: undefined,
    starterCode: undefined,
    starterWorkspace: null,
    toolManifest: null,
    item: null,
    ...overrides,
  } as any;
}

describe("resolveDeterministicEditorSource", () => {
  it("does not treat unresolved @: starter aliases as concrete starter content", () => {
    const resolved = resolveDeterministicEditorSource(
      makeEntry({
        starterCode: "@:topics.sql-v2.module.topic.quiz.step.starterCode",
        toolManifest: {
          workspace: {
            starterCode: "@:topics.sql-v2.module.topic.quiz.step.starterCode",
            starterFiles: [
              {
                path: "query.sql",
                content: "@:topics.sql-v2.module.topic.quiz.step.starterCode",
                isEntry: true,
              },
            ],
          },
        },
      }),
    );

    expect(resolved?.workspaceSeedMode).toBe("empty");
  });

  it("treats canonical workspace starter files as starter-backed seed content", () => {
    const resolved = resolveDeterministicEditorSource(
      makeEntry({
        toolManifest: {
          workspace: {
            starterFiles: [
              {
                path: "query.sql",
                content: "-- real starter SQL\nSELECT name\nFROM products;\n",
                isEntry: true,
              },
            ],
          },
        },
      }),
    );

    expect(resolved?.workspaceSeedMode).toBe("starter");
  });

  it("does not interpret entry-level legacy starter aliases as curriculum source", () => {
    const resolved = resolveDeterministicEditorSource(
      makeEntry({
        starterFiles: [
          {
            path: "query.sql",
            content: "-- legacy entry alias\nSELECT 1;\n",
            isEntry: true,
          },
        ],
      }),
    );

    expect(resolved?.workspaceSeedMode).toBe("empty");
  });
});
