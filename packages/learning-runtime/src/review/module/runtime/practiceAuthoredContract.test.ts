import { describe, expect, it } from "vitest";

import {
  isLearnerOwnedPracticeRuntimeState,
  resolvePracticeAuthoredContractValue,
  shouldMirrorPracticeAuthoredContractFieldToItem,
} from "./practiceAuthoredContract";

describe("Practice authored/runtime workspace ownership", () => {
  it("keeps learner-owned item workspace out of exercise.workspace", () => {
    const canonical = {
      entryFilePath: "main.py",
      starterFiles: [
        { path: "main.py", content: "# main" },
        { path: "models/transaction.py", content: "class Transaction:\n    pass\n" },
      ],
    };
    const staleNested = {
      entryFilePath: "main.py",
      starterFiles: [{ path: "main.py", content: "# stale" }],
    };
    const learnerWorkspace = {
      version: 2,
      nodes: [{ kind: "file", name: "main.py", content: "print('edit')\n" }],
    };

    expect(
      resolvePracticeAuthoredContractValue({
        field: "workspace",
        resolvedValue: canonical,
        currentExerciseValue: staleNested,
        currentItemValue: learnerWorkspace,
        learnerOwnedRuntimeState: true,
      }),
    ).toBe(canonical);

    expect(
      shouldMirrorPracticeAuthoredContractFieldToItem({
        field: "workspace",
        learnerOwnedRuntimeState: true,
      }),
    ).toBe(false);
  });

  it("keeps resolved authored workspace exercise-only for all runtime origins", () => {
    const resolvedWorkspace = {
      entryFilePath: "query.sql",
      starterFiles: [
        {
          path: "query.sql",
          content: "-- resolved starter\n",
          isEntry: true,
        },
      ],
    };
    const rawWorkspace = {
      entryFilePath: "query.sql",
      starterFiles: [
        {
          path: "query.sql",
          content: "@:raw.starterCode",
          isEntry: true,
        },
      ],
    };
    const runtimeWorkspace = {
      version: 2,
      language: "sql",
      nodes: [],
    };

    expect(
      resolvePracticeAuthoredContractValue({
        field: "workspace",
        resolvedValue: resolvedWorkspace,
        currentExerciseValue: rawWorkspace,
        currentItemValue: runtimeWorkspace,
        learnerOwnedRuntimeState: false,
      }),
    ).toBe(resolvedWorkspace);

    expect(
      resolvePracticeAuthoredContractValue({
        field: "workspace",
        resolvedValue: undefined,
        currentExerciseValue: rawWorkspace,
        currentItemValue: runtimeWorkspace,
        learnerOwnedRuntimeState: false,
      }),
    ).toBe(rawWorkspace);

    expect(
      resolvePracticeAuthoredContractValue({
        field: "workspace",
        resolvedValue: undefined,
        currentExerciseValue: undefined,
        currentItemValue: runtimeWorkspace,
        learnerOwnedRuntimeState: false,
      }),
    ).toBeUndefined();

    expect(
      shouldMirrorPracticeAuthoredContractFieldToItem({
        field: "workspace",
        learnerOwnedRuntimeState: false,
      }),
    ).toBe(false);

    expect(
      shouldMirrorPracticeAuthoredContractFieldToItem({
        field: "workspace",
        learnerOwnedRuntimeState: true,
      }),
    ).toBe(false);
  })

  it("falls back to nested live exercise workspace only when canonical workspace is absent", () => {
    const nestedLive = {
      entryFilePath: "main.py",
      starterFiles: [
        { path: "main.py", content: "# nested fallback" },
      ],
    };
    const learnerWorkspace = {
      version: 2,
      nodes: [
        { kind: "file", name: "main.py", content: "print('learner edit')\n" },
      ],
    };

    expect(
      resolvePracticeAuthoredContractValue({
        field: "workspace",
        resolvedValue: undefined,
        currentExerciseValue: nestedLive,
        currentItemValue: learnerWorkspace,
        learnerOwnedRuntimeState: true,
      }),
    ).toBe(nestedLive);
  });

  it("preserves old live precedence for solution fields", () => {
    const live = [{ path: "query.sql", content: "-- live\n" }];
    expect(
      resolvePracticeAuthoredContractValue({
        field: "solutionFiles",
        resolvedValue: [{ path: "main.py", content: "# compiled\n" }],
        currentExerciseValue: undefined,
        currentItemValue: live,
        learnerOwnedRuntimeState: false,
      }),
    ).toBe(live);
  });

  it("recognizes learner-owned saved/completed runtime state", () => {
    expect(isLearnerOwnedPracticeRuntimeState({ workspaceOrigin: "saved" })).toBe(true);
    expect(isLearnerOwnedPracticeRuntimeState({ workspaceOrigin: "starter" })).toBe(false);
    expect(
      isLearnerOwnedPracticeRuntimeState({
        workspaceOrigin: "sync",
        result: { ok: true },
      }),
    ).toBe(true);
  });
});
