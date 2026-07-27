import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  canonicalizeReviewExerciseStateKey,
  getReviewSavedWorkspace,
  getSavedReviewExerciseCode,
  getSavedReviewExerciseLanguage,
  getSavedReviewExerciseStdin,
  hasSavedReviewExerciseContent,
  hasSavedReviewExerciseEditorContent,
  isScopedReviewExerciseStateKey,
  looksLikeBetterReviewExerciseRestoreCandidate,
  savedReviewExerciseLooksLikeLearnerEditorWork,
} from "@zoeskoul/learning-runtime";
import {
  workspaceContentHash,
} from "@zoeskoul/workspace-contracts";

function makeWorkspace(args?: {
  content?: string;
  stdin?: string;
  language?: string;
  extraFile?: boolean;
}) {
  const content =
    args?.content ?? "print('saved')\n";

  return {
    version: 2,
    language: args?.language ?? "python",
    nodes: [
      {
        id: "main",
        kind: "file",
        name: "main.py",
        content,
      },
      ...(args?.extraFile
        ? [
            {
              id: "helper",
              kind: "file",
              name: "helper.py",
              content: "HELPER = true\n",
            },
          ]
        : []),
    ],
    openTabs: ["main"],
    activeFileId: "main",
    entryFileId: "main",
    stdin: args?.stdin ?? "",
    expanded: [],
    leftPct: 50,
  };
}

describe("review runtime restore contracts", () => {
  it("canonicalizes scoped exercise keys with a fallback topic", () => {
    expect(
      canonicalizeReviewExerciseStateKey(
        "python:python-1:section-a:old-topic:card-a:q:1",
        "section.new-topic",
      ),
    ).toBe(
      "python:python-1:section-a:new-topic:card-a:q-1",
    );

    expect(
      isScopedReviewExerciseStateKey(
        "python:python-1:section-a:new-topic:card-a:q-1",
      ),
    ).toBe(true);
  });

  it("discovers workspaces through all persisted compatibility fields", () => {
    const workspace = makeWorkspace();

    expect(
      getReviewSavedWorkspace({
        codeWorkspace: workspace,
      }),
    ).toBe(workspace);

    expect(
      getReviewSavedWorkspace({
        ideWorkspace: workspace,
      }),
    ).toBe(workspace);

    expect(
      getReviewSavedWorkspace({
        toolWorkspace: workspace,
      }),
    ).toBe(workspace);
  });

  it("hydrates progress-only exercise state without editor content", () => {
    expect(
      hasSavedReviewExerciseContent({
        checked: true,
        attempts: 2,
      }),
    ).toBe(true);

    expect(
      hasSavedReviewExerciseEditorContent({
        checked: true,
        attempts: 2,
      }),
    ).toBe(false);
  });

  it("keeps explicit learner work and rejects passive starter snapshots", () => {
    const workspace = makeWorkspace();

    expect(
      savedReviewExerciseLooksLikeLearnerEditorWork(
        {
          workspace,
          workspaceOrigin: "user",
          userEdited: true,
        },
        workspace,
      ),
    ).toBe(true);

    expect(
      savedReviewExerciseLooksLikeLearnerEditorWork(
        {
          workspace,
          workspaceOrigin: "starter",
          userEdited: false,
        },
        workspace,
      ),
    ).toBe(false);
  });

  it("recognizes legacy learner edits by starter-hash mismatch", () => {
    const starter = makeWorkspace({
      content: "print('starter')\n",
    });
    const learner = makeWorkspace({
      content: "print('learner')\n",
    });

    expect(
      savedReviewExerciseLooksLikeLearnerEditorWork(
        {
          workspace: learner,
          starterHash:
            workspaceContentHash(starter),
        },
        learner,
      ),
    ).toBe(true);
  });

  it("uses workspace values before legacy code mirrors", () => {
    const workspace = makeWorkspace({
      content: "print('workspace')\n",
      stdin: "workspace input",
      language: "python",
    });

    const saved = {
      code: "print('legacy')\n",
      source: "print('source')\n",
      codeStdin: "legacy input",
      codeLang: "javascript",
    };

    expect(
      getSavedReviewExerciseCode(
        saved,
        workspace,
      ),
    ).toBe("print('workspace')\n");
    expect(
      getSavedReviewExerciseStdin(
        saved,
        workspace,
      ),
    ).toBe("workspace input");
    expect(
      getSavedReviewExerciseLanguage(
        saved,
        workspace,
        "sql",
      ),
    ).toBe("python");
  });

  it("prefers user-owned, richer, then newer restore candidates", () => {
    const now = vi.spyOn(
      Date,
      "now",
    ).mockReturnValue(100);

    expect(
      looksLikeBetterReviewExerciseRestoreCandidate(
        {
          workspace: makeWorkspace(),
          workspaceOrigin: "starter",
          updatedAt: 50,
        },
        {
          workspace: makeWorkspace(),
          workspaceOrigin: "user",
          updatedAt: 1,
        },
      ),
    ).toBe(true);

    expect(
      looksLikeBetterReviewExerciseRestoreCandidate(
        {
          workspace: makeWorkspace(),
          workspaceOrigin: "user",
          updatedAt: 20,
        },
        {
          workspace: makeWorkspace({
            extraFile: true,
          }),
          workspaceOrigin: "user",
          updatedAt: 10,
        },
      ),
    ).toBe(true);

    expect(
      looksLikeBetterReviewExerciseRestoreCandidate(
        {
          workspace: makeWorkspace(),
          workspaceOrigin: "user",
          updatedAt: 20,
        },
        {
          workspace: makeWorkspace(),
          workspaceOrigin: "user",
          updatedAt: 30,
        },
      ),
    ).toBe(true);

    now.mockRestore();
  });
});
