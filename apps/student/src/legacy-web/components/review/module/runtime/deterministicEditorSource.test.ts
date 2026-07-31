import { describe, expect, it } from "vitest";
import { resolveDeterministicEditorSource } from "./deterministicEditorSource";

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

  it("treats localized starter files as starter-backed seed content", () => {
    const resolved = resolveDeterministicEditorSource(
      makeEntry({
        starterFiles: [
          {
            path: "query.sql",
            content: "-- real starter SQL\nSELECT name\nFROM products;\n",
            isEntry: true,
          },
        ],
      }),
    );

    expect(resolved?.workspaceSeedMode).toBe("starter");
  });
});
