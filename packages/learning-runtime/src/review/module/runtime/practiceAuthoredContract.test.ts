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

  it("keeps canonical starterFiles for learner-owned state instead of stale live files", () => {
    const canonicalStarterFiles = [
      { path: "main.py", content: "# canonical main" },
      {
        path: "models/transaction.py",
        content: "class Transaction:\n    pass\n",
      },
    ];
    const staleStarterFiles = [
      { path: "main.py", content: "# stale main only" },
    ];

    expect(
      resolvePracticeAuthoredContractValue({
        field: "starterFiles",
        resolvedValue: canonicalStarterFiles,
        currentExerciseValue: staleStarterFiles,
        currentItemValue: staleStarterFiles,
        learnerOwnedRuntimeState: true,
      }),
    ).toBe(canonicalStarterFiles);
  });

  it("keeps canonical starterCode for learner-owned state", () => {
    expect(
      resolvePracticeAuthoredContractValue({
        field: "starterCode",
        resolvedValue: "from models.transaction import Transaction\n",
        currentExerciseValue: "print('stale')\n",
        currentItemValue: "print('learner runtime')\n",
        learnerOwnedRuntimeState: true,
      }),
    ).toBe("from models.transaction import Transaction\n");
  });

  it("still accepts top-level live workspace for non-user dynamic Practice items", () => {
    const liveWorkspace = {
      version: 2,
      nodes: [
        { kind: "file", name: "main.py" },
        { kind: "file", name: "data.txt" },
      ],
    };

    expect(
      resolvePracticeAuthoredContractValue({
        field: "workspace",
        resolvedValue: undefined,
        currentExerciseValue: undefined,
        currentItemValue: liveWorkspace,
        learnerOwnedRuntimeState: false,
      }),
    ).toBe(liveWorkspace);

    expect(
      shouldMirrorPracticeAuthoredContractFieldToItem({
        field: "workspace",
        learnerOwnedRuntimeState: false,
      }),
    ).toBe(true);
  });

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

  it("preserves old live precedence for non-workspace fields", () => {
    const live = [{ path: "query.sql", content: "-- live\n" }];
    expect(
      resolvePracticeAuthoredContractValue({
        field: "starterFiles",
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
