import { beforeEach, describe, expect, it } from "vitest";

import { useReviewRuntimeStore } from "./reviewRuntimeStore";

function workspace(code: string) {
  return {
    version: 2 as const,
    language: "python" as const,
    nodes: [
      {
        id: "file:main.py",
        kind: "file" as const,
        name: "main.py",
        parentId: null,
        content: code,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    openTabs: ["file:main.py"],
    activeFileId: "file:main.py",
    entryFileId: "file:main.py",
    stdin: "",
    expanded: [],
    leftPct: 26,
  };
}

function codeOf(value: any) {
  return value?.nodes?.find((node: any) => node?.kind === "file")?.content ?? "";
}

function resetRuntimeStore() {
  useReviewRuntimeStore.setState({
    subjectSlug: null,
    moduleSlug: null,
    sectionSlug: null,
    activeTopicId: null,
    viewTopicId: null,
    activeCardIndex: 0,
    activeExerciseKey: null,
    resetRevision: 0,
    boundToolWorkspace: null,
    cards: {},
    exercises: {},
    editorRuntimes: {},
    tool: { boundExerciseKey: null },
    targetRegistry: null,
    persistence: {
      dirty: false,
      pendingExerciseKeys: new Set(),
      pendingCardKeys: new Set(),
    },
  });
}

describe("review runtime progress hydration ownership", () => {
  beforeEach(() => {
    resetRuntimeStore();
  });

  it("hydrates learner workspace without allowing persisted progress to redefine authored starter identity", () => {
    const exerciseKey =
      "python-v2:python-v2-1:python-v2-python-v2-1-variables-and-assignment:input-and-type-conversion:input-and-type-conversion_p4:code_echo_name";

    const authoredCode =
      "# Read one line into name\n# Print name unchanged\n";

    const pollutedStarterCode =
      `${authoredCode}# SAVE_TRACE_9912\n`;

    const learnerCode =
      `${pollutedStarterCode}` +
      "# __SAVE_TRACE_9913__\n" +
      "# __SAVE_TRACE_9914__\n" +
      "# __SAVE_TRACE_9915__\n";

    const authoredWorkspace = workspace(authoredCode);
    const pollutedStarterWorkspace = workspace(pollutedStarterCode);
    const learnerWorkspace = workspace(learnerCode);

    const authoredManifest = {
      id: "code_echo_name",
      kind: "code_input",
      language: "python",
      workspace: authoredWorkspace,
    };

    const runtime = useReviewRuntimeStore.getState();

    // Route/runtime contract is registered from authored curriculum first.
    runtime.ensureExercise({
      exerciseKey,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      sectionSlug: "python-v2-python-v2-1-variables-and-assignment",
      topicId: "input-and-type-conversion",
      cardId: "input-and-type-conversion_p4",
      manifest: authoredManifest,
    });

    const beforeHydrate =
      useReviewRuntimeStore.getState().exercises[exerciseKey];

    const authoredStarterHash = beforeHydrate?.starterHash;

    expect(codeOf(beforeHydrate?.starterWorkspace)).toBe(authoredCode);
    expect(authoredStarterHash).toBeTruthy();
    expect(beforeHydrate?.manifest).toBe(authoredManifest);

    // Reproduce useReviewProgress hydration:
    // persisted learner state is incorrectly supplied as both manifest + saved.
    const persisted = {
      exerciseKey,
      exerciseId: "code_echo_name",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      sectionSlug: "python-v2-python-v2-1-variables-and-assignment",
      topicId: "input-and-type-conversion",
      cardId: "input-and-type-conversion_p4",

      language: "python",
      lang: "python",

      workspace: learnerWorkspace,
      codeWorkspace: learnerWorkspace,
      ideWorkspace: learnerWorkspace,
      code: learnerCode,
      source: learnerCode,
      stdin: "",
      codeStdin: "",

      userEdited: true,
      workspaceOrigin: "user",

      // Corrupted persistence must never become current authored identity.
      starterWorkspace: pollutedStarterWorkspace,
      starterHash: "PERSISTED_BAD_STARTER_HASH",
      manifest: {
        ...authoredManifest,
        workspace: pollutedStarterWorkspace,
      },
    };

    runtime.ensureExercise({
      exerciseKey,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      sectionSlug: "python-v2-python-v2-1-variables-and-assignment",
      topicId: "input-and-type-conversion",
      cardId: "input-and-type-conversion_p4",
      manifest: persisted as any,
      saved: persisted as any,
    });

    runtime.patchExercise(exerciseKey, {
      ...(persisted as any),
      generation: 0,
      updateOrigin: "review-progress-hydrate",
      workspaceMutation: {
        generation: 0,
        source: "review-progress-hydrate",
        mutation: "hydrate",
      },
    });

    const hydrated =
      useReviewRuntimeStore.getState().exercises[exerciseKey];

    // Learner data must hydrate.
    expect(codeOf(hydrated?.workspace)).toBe(learnerCode);
    expect(hydrated?.workspaceOrigin).toBe("user");
    expect(hydrated?.userEdited).toBe(true);

    // Authored identity must remain immutable during DB hydration.
    expect(codeOf(hydrated?.starterWorkspace)).toBe(authoredCode);
    expect(hydrated?.starterHash).toBe(authoredStarterHash);
    expect((hydrated?.manifest as any)?.workspace).toEqual(authoredWorkspace);
  });
});
