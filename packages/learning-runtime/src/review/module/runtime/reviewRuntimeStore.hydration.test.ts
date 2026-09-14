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

  it("repairs a legacy production starter polluted before authored registration while preserving learner work until reset", () => {
    const exerciseKey =
      "python-v2:python-v2-1:python-v2-python-v2-1-string-foundations:f-strings-and-formatting:f-strings-and-formatting_s0:ci_print_profile_line";

    const subjectSlug = "python-v2";
    const moduleSlug = "python-v2-1";
    const sectionSlug = "python-v2-python-v2-1-string-foundations";
    const topicId = "f-strings-and-formatting";
    const cardId = "f-strings-and-formatting_s0";
    const exerciseId = "ci_print_profile_line";

    const authoredCode =
      '# Store "Mila" in name\n' +
      "# Store 13 in age\n" +
      "# Print the sentence with one f-string\n";

    const legacyLearnerCode =
      "# TODO: store the values in variables\n" +
      "# TODO: print the sentence with an f-string\n" +
      "ooppppp";

    const authoredWorkspace = workspace(authoredCode);
    const legacyLearnerWorkspace = workspace(legacyLearnerCode);

    const authoredManifest = {
      id: exerciseId,
      kind: "code_input",
      language: "python",
      workspace: authoredWorkspace,
    };

    // Obtain the real canonical hash produced by the runtime, then recreate
    // the production ordering where polluted progress exists BEFORE authored
    // registration occurs.
    useReviewRuntimeStore.getState().ensureExercise({
      exerciseKey,
      subjectSlug,
      moduleSlug,
      sectionSlug,
      topicId,
      cardId,
      manifest: authoredManifest,
    });

    const canonicalStarterHash =
      useReviewRuntimeStore.getState().exercises[exerciseKey]?.starterHash;

    expect(canonicalStarterHash).toBeTruthy();

    resetRuntimeStore();

    const legacyPollutedExercise = {
      exerciseKey,
      exerciseId,
      subjectSlug,
      moduleSlug,
      sectionSlug,
      topicId,
      cardId,

      language: "python",
      lang: "python",

      workspace: legacyLearnerWorkspace,
      codeWorkspace: legacyLearnerWorkspace,
      ideWorkspace: legacyLearnerWorkspace,
      code: legacyLearnerCode,
      source: legacyLearnerCode,
      stdin: "",
      codeStdin: "",

      userEdited: true,
      workspaceOrigin: "user",
      workspaceStatus: "ready",
      workspaceGeneration: 0,

      // Exact legacy production split-brain shape:
      // hash is canonical, snapshot/manifest are polluted.
      starterHash: canonicalStarterHash,
      starterWorkspace: legacyLearnerWorkspace,

      manifest: {
        id: exerciseId,
        kind: "code_input",
        language: "python",
        code: legacyLearnerCode,
        source: legacyLearnerCode,
        workspace: legacyLearnerWorkspace,
      },

      runner: {},
      answer: { revealed: false },
      sketch: null,
      status: "in_progress",
      fileEditState: {
        "main.py": {
          origin: "learner",
          generation: 0,
          hasUserEdited: true,
        },
      },
    } as any;

    useReviewRuntimeStore.setState((state) => ({
      exercises: {
        ...state.exercises,
        [exerciseKey]: legacyPollutedExercise,
      },
    }));

    // This is the ordering production needs to heal:
    //
    // legacy DB state B already exists
    // -> real authored contract A arrives
    // -> preserve live learner B
    // -> repair starter identity to A
    useReviewRuntimeStore.getState().ensureExercise({
      exerciseKey,
      subjectSlug,
      moduleSlug,
      sectionSlug,
      topicId,
      cardId,
      manifest: authoredManifest,
      saved: legacyPollutedExercise,
    });

    const healed =
      useReviewRuntimeStore.getState().exercises[exerciseKey];

    // Do not erase the learner's existing work just because metadata was bad.
    expect(codeOf(healed?.workspace)).toBe(legacyLearnerCode);
    expect(healed?.workspaceOrigin).toBe("user");
    expect(healed?.userEdited).toBe(true);

    // Authored starter identity must self-heal.
    expect(codeOf(healed?.starterWorkspace)).toBe(authoredCode);
    expect(healed?.starterHash).toBe(canonicalStarterHash);
    expect(codeOf((healed?.manifest as any)?.workspace)).toBe(authoredCode);

    // Once the learner explicitly resets, the repaired authored starter wins.
    const result =
      useReviewRuntimeStore.getState().resetExerciseToStarter({
        topicId,
        cardId,
        exerciseId,
        exerciseStateKey: exerciseKey,
      });

    expect(result.restored).toBe(true);

    const resetExercise =
      useReviewRuntimeStore.getState().exercises[exerciseKey];

    expect(codeOf(resetExercise?.workspace)).toBe(authoredCode);
    expect(codeOf(resetExercise?.starterWorkspace)).toBe(authoredCode);
    expect(resetExercise?.workspaceOrigin).toBe("starter");
    expect(resetExercise?.userEdited).toBe(false);
    expect(codeOf(resetExercise?.workspace)).not.toContain("ooppppp");
  });

});
