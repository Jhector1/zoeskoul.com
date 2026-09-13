import { beforeEach, describe, expect, it } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import { useReviewRuntimeStore } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRuntimeStore";
import { resolveCanonicalExercisePresentation } from "@zoeskoul/learning-runtime/review/module/runtime/canonicalExercisePresentation";

function makeWorkspace(files: Array<{ path: string; content: string }>): WorkspaceStateV2 {
  const now = Date.now();
  const nodes: WorkspaceStateV2["nodes"] = [];
  const folderIds = new Map<string, string>();

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? "main.py";
    let parentId: string | null = null;
    let folderPath = "";

    for (const part of parts.slice(0, -1)) {
      folderPath = folderPath ? `${folderPath}/${part}` : part;
      let folderId = folderIds.get(folderPath);
      if (!folderId) {
        folderId = `folder:${folderPath}`;
        folderIds.set(folderPath, folderId);
        nodes.push({
          id: folderId,
          kind: "folder",
          name: part,
          parentId,
          createdAt: now,
          updatedAt: now,
        });
      }
      parentId = folderId;
    }

    nodes.push({
      id: `file:${file.path}`,
      kind: "file",
      name,
      parentId,
      content: file.content,
      createdAt: now,
      updatedAt: now,
    });
  }

  const firstFileId = String(nodes.find((node) => node.kind === "file")?.id ?? "file:main.py");
  const activeFileId = String(
    nodes.find((node) => node.kind === "file" && node.name === "main.py")?.id ?? firstFileId,
  );

  return {
    version: 2,
    language: "python",
    nodes,
    openTabs: [activeFileId],
    activeFileId,
    entryFileId: activeFileId,
    stdin: "",
    expanded: Array.from(folderIds.values()),
    leftPct: 40,
  };
}

function fileContent(workspace: WorkspaceStateV2 | null | undefined, path: string) {
  if (!workspace?.nodes) return null;
  const segments = path.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] ?? "";

  const folderPathById = new Map<string, string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of workspace.nodes) {
      if (node.kind !== "folder") continue;
      if (folderPathById.has(node.id)) continue;
      const parentPath =
        node.parentId && folderPathById.has(node.parentId)
          ? folderPathById.get(node.parentId) ?? ""
          : node.parentId
            ? null
            : "";
      if (parentPath == null) continue;
      folderPathById.set(node.id, parentPath ? `${parentPath}/${node.name}` : node.name);
      changed = true;
    }
  }

  const resolved = workspace.nodes.find((node) => {
    if (node.kind !== "file") return false;
    if (node.name !== fileName) return false;
    const parentPath = node.parentId ? folderPathById.get(node.parentId) ?? "" : "";
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    return fullPath === path;
  });

  return resolved && resolved.kind === "file" ? resolved.content : null;
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
    tool: {
      boundExerciseKey: null,
    },
    persistence: {
      dirty: false,
      pendingExerciseKeys: new Set(),
      pendingCardKeys: new Set(),
    },
    targetRegistry: null,
  } as any);
}

describe("reviewRuntimeStore reset generation boundary", () => {
  beforeEach(() => {
    resetRuntimeStore();
  });

  it("repairs collateral blanks for main.py edits, rejects stale async writes, and preserves intentional car.py clears", () => {
    const ownerKey =
      "python:python-8-object-oriented-foundations:section:thinking-in-objects:card-2:read-values-from-car-objects";
    const starterWorkspace = makeWorkspace([
      { path: "main.py", content: 'from models.car import Car\n\nprint("starter")\n' },
      { path: "models/car.py", content: "class Car:\n    pass\n" },
    ]);
    const blankShellWorkspace = makeWorkspace([
      { path: "main.py", content: "" },
      { path: "models/car.py", content: "" },
    ]);
    const learnerClearedWorkspace = makeWorkspace([
      { path: "main.py", content: 'from models.car import Car\nprint("new gen learner edit")\n' },
      { path: "models/car.py", content: "" },
    ]);
    const learnerMainOnlyWorkspace = makeWorkspace([
      { path: "main.py", content: 'from models.car import Car\nprint("main only edit")\n' },
      { path: "models/car.py", content: "" },
    ]);
    const currentGenerationShellWorkspace = makeWorkspace([
      { path: "main.py", content: 'from models.car import Car\nprint("main only edit")\n' },
      { path: "models/car.py", content: "" },
    ]);

    const entry = {
      targetKey: ownerKey,
      routeKey: ownerKey,
      targetKind: "exercise",
      sectionSlug: "section",
      topicId: "thinking-in-objects",
      topicSlug: "thinking-in-objects",
      cardId: "card-2",
      cardType: "project",
      targetSlug: "read-values-from-car-objects",
      ownerKind: "exercise",
      ownerKey,
      cardKey: "thinking-in-objects:card-2",
      toolScopeKey: ownerKey,
      exerciseId: "read-values-from-car-objects",
      exerciseStateKey: ownerKey,
      language: "python",
      starterFiles: [
        { path: "main.py", content: 'from models.car import Car\n\nprint("starter")\n' },
        { path: "models/car.py", content: "class Car:\n    pass\n" },
      ],
      item: {
        workspace: starterWorkspace,
      },
    } as any;

    const runtime = useReviewRuntimeStore.getState();

    runtime.ensureEditorSource({
      ownerKey,
      ownerKind: "exercise",
      targetKey: ownerKey,
      toolScopeKey: ownerKey,
      language: "python",
      manifest: entry.item,
      entry,
      workspaceSeedMode: "starter",
    });

    runtime.patchEditorWorkspace(ownerKey, starterWorkspace, {
      generation: 0,
      source: "initial-starter",
    });

    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    pass\n",
    );

    runtime.clearRuntimeForCard("thinking-in-objects", "card-2");
    expect(useReviewRuntimeStore.getState().resetRevision).toBe(1);

    runtime.ensureEditorSource({
      ownerKey,
      ownerKind: "exercise",
      targetKey: ownerKey,
      toolScopeKey: ownerKey,
      language: "python",
      manifest: entry.item,
      entry,
      workspaceSeedMode: "starter",
    });

    runtime.patchEditorWorkspace(ownerKey, starterWorkspace, {
      generation: 1,
      source: "authoritative-reset",
      mutation: {
        generation: 1,
        source: "authoritative-reset",
        mutation: "reset",
      },
    });

    runtime.patchExercise(ownerKey, {
      generation: 1,
      workspaceMutation: {
        generation: 1,
        source: "authoritative-reset",
        mutation: "reset",
      },
      language: "python",
      lang: "python",
      workspace: starterWorkspace,
      codeWorkspace: starterWorkspace,
      ideWorkspace: starterWorkspace,
      code: 'from models.car import Car\n\nprint("starter")\n',
      source: 'from models.car import Car\n\nprint("starter")\n',
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "starter",
      userEdited: false,
    });

    runtime.patchEditorWorkspace(ownerKey, blankShellWorkspace, {
      generation: 0,
      source: "stale-blank-shell",
    });
    runtime.patchExercise(ownerKey, {
      generation: 0,
      language: "python",
      lang: "python",
      workspace: blankShellWorkspace,
      codeWorkspace: blankShellWorkspace,
      ideWorkspace: blankShellWorkspace,
      code: "",
      source: "",
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "starter",
      userEdited: false,
    });

    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "main.py")).toBe(
      'from models.car import Car\n\nprint("starter")\n',
    );
    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    pass\n",
    );
    expect(fileContent(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace, "main.py")).toBe(
      'from models.car import Car\n\nprint("starter")\n',
    );

    runtime.patchEditorWorkspace(ownerKey, learnerMainOnlyWorkspace, {
      generation: 1,
      source: "code-tool-emit-upstream",
      mutation: {
        generation: 1,
        source: "code-tool-emit-upstream",
        mutation: "user-content",
        changedFilePaths: ["main.py"],
      },
    });
    runtime.patchExercise(ownerKey, {
      generation: 1,
      updateOrigin: "user",
      workspaceMutation: {
        generation: 1,
        source: "code-tool-emit-upstream",
        mutation: "user-content",
        changedFilePaths: ["main.py"],
      },
      language: "python",
      lang: "python",
      workspace: learnerMainOnlyWorkspace,
      codeWorkspace: learnerMainOnlyWorkspace,
      ideWorkspace: learnerMainOnlyWorkspace,
      code: 'from models.car import Car\nprint("main only edit")\n',
      source: 'from models.car import Car\nprint("main only edit")\n',
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "user",
      userEdited: true,
    });

    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    pass\n",
    );
    expect(fileContent(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    pass\n",
    );
    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.fileEditState?.["main.py"]?.hasUserEdited).toBe(
      true,
    );
    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.fileEditState?.["models/car.py"]?.hasUserEdited).toBe(
      false,
    );

    runtime.patchEditorWorkspace(ownerKey, currentGenerationShellWorkspace, {
      generation: 1,
      source: "quiz-practice-hydrate",
      mutation: {
        generation: 1,
        source: "quiz-practice-hydrate",
        mutation: "hydrate",
      },
    });
    runtime.patchExercise(ownerKey, {
      generation: 1,
      updateOrigin: "quiz-practice-hydrate",
      workspaceMutation: {
        generation: 1,
        source: "quiz-practice-hydrate",
        mutation: "hydrate",
      },
      language: "python",
      lang: "python",
      workspace: currentGenerationShellWorkspace,
      codeWorkspace: currentGenerationShellWorkspace,
      ideWorkspace: currentGenerationShellWorkspace,
      code: 'from models.car import Car\nprint("main only edit")\n',
      source: 'from models.car import Car\nprint("main only edit")\n',
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "starter",
      userEdited: false,
    });

    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    pass\n",
    );
    expect(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.fileEditState?.["models/car.py"]?.hasUserEdited).toBe(
      false,
    );

    runtime.patchEditorWorkspace(ownerKey, learnerClearedWorkspace, {
      generation: 1,
      source: "code-tool-emit-upstream",
      mutation: {
        generation: 1,
        source: "code-tool-emit-upstream",
        mutation: "user-content",
        changedFilePaths: ["models/car.py"],
      },
    });
    runtime.patchExercise(ownerKey, {
      generation: 1,
      updateOrigin: "user",
      workspaceMutation: {
        generation: 1,
        source: "code-tool-emit-upstream",
        mutation: "user-content",
        changedFilePaths: ["models/car.py"],
      },
      language: "python",
      lang: "python",
      workspace: learnerClearedWorkspace,
      codeWorkspace: learnerClearedWorkspace,
      ideWorkspace: learnerClearedWorkspace,
      code: 'from models.car import Car\nprint("new gen learner edit")\n',
      source: 'from models.car import Car\nprint("new gen learner edit")\n',
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "user",
      userEdited: true,
    });

    runtime.ensureEditorSource({
      ownerKey,
      ownerKind: "exercise",
      targetKey: ownerKey,
      toolScopeKey: ownerKey,
      language: "python",
      manifest: entry.item,
      entry,
      workspaceSeedMode: "starter",
    });

    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "models/car.py")).toBe(
      "",
    );
    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "main.py")).toBe(
      'from models.car import Car\nprint("new gen learner edit")\n',
    );
    expect(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspaceGeneration).toBe(1);
    expect(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.fileEditState?.["models/car.py"]?.hasUserEdited).toBe(
      true,
    );
  });

  it("atomically resets the selected multi-file exercise to its authored starter and rejects the old generation", () => {
    const ownerKey =
      "applied-python-projects:python-8-object-oriented-foundations:section:thinking-in-objects:sketch0:try-thinking-in-objects-sketch0";
    const starterWorkspace = makeWorkspace([
      {
        path: "main.py",
        content: "from models.car import Car\n\ncar = Car('Honda', 'Civic', 12000)\n",
      },
      {
        path: "models/car.py",
        content:
          "class Car:\n    def __init__(self, make, model, miles):\n        self.make = make\n        self.model = model\n        self.miles = miles\n",
      },
    ]);
    const learnerWorkspace = makeWorkspace([
      {
        path: "main.py",
        content: "from models.car import Car\n\nprint('learner edit')\n",
      },
      {
        path: "models/car.py",
        content:
          "class Car:\n    def __init__(self, make, model, miles):\n        self.milessggggg = miles\n",
      },
      {
        path: "models/base_item.py",
        content: "class Car:\n    pass\n",
      },
    ]);

    const runtime = useReviewRuntimeStore.getState();
    runtime.setReviewScope({
      subjectSlug: "applied-python-projects",
      moduleSlug: "python-8-object-oriented-foundations",
      sectionSlug: "section",
      activeTopicId: "thinking-in-objects",
      viewTopicId: "thinking-in-objects",
    });
    runtime.ensureExercise({
      exerciseKey: ownerKey,
      subjectSlug: "applied-python-projects",
      moduleSlug: "python-8-object-oriented-foundations",
      sectionSlug: "section",
      topicId: "thinking-in-objects",
      cardId: "sketch0",
      manifest: {
        id: "try-thinking-in-objects-sketch0",
        language: "python",
        workspace: starterWorkspace,
      },
    });
    runtime.ensureEditorSource({
      ownerKey,
      ownerKind: "exercise",
      targetKey: `exercise:${ownerKey}`,
      toolScopeKey: ownerKey,
      language: "python",
      manifest: { workspace: starterWorkspace },
      entry: {
        item: { workspace: starterWorkspace },
      } as any,
      workspaceSeedMode: "starter",
    });
    runtime.patchEditorWorkspace(ownerKey, learnerWorkspace, {
      generation: 0,
      source: "code-tool-emit-upstream",
      mutation: {
        generation: 0,
        source: "code-tool-emit-upstream",
        mutation: "user-content",
        changedFilePaths: ["main.py", "models/car.py"],
      },
    });
    runtime.patchExercise(ownerKey, {
      generation: 0,
      updateOrigin: "user",
      workspaceMutation: {
        generation: 0,
        source: "code-tool-emit-upstream",
        mutation: "user-content",
        changedFilePaths: ["main.py", "models/car.py"],
      },
      workspace: learnerWorkspace,
      codeWorkspace: learnerWorkspace,
      ideWorkspace: learnerWorkspace,
      code: "from models.car import Car\n\nprint('learner edit')\n",
      source: "from models.car import Car\n\nprint('learner edit')\n",
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "user",
      userEdited: true,
    });
    runtime.bindExerciseTool(ownerKey);

    const result = runtime.resetExerciseToStarter({
      topicId: "thinking-in-objects",
      cardId: "sketch0",
      exerciseId: "try-thinking-in-objects-sketch0",
      exerciseStateKey: ownerKey,
    });

    expect(result).toMatchObject({
      exerciseKey: ownerKey,
      resetRevision: 1,
      restored: true,
    });
    expect(fileContent(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace, "main.py")).toBe(
      "from models.car import Car\n\ncar = Car('Honda', 'Civic', 12000)\n",
    );
    expect(fileContent(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    def __init__(self, make, model, miles):\n        self.make = make\n        self.model = model\n        self.miles = miles\n",
    );
    expect(fileContent(useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    def __init__(self, make, model, miles):\n        self.make = make\n        self.model = model\n        self.miles = miles\n",
    );
    expect(
      fileContent(
        useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace,
        "models/base_item.py",
      ),
    ).toBeNull();
    expect(
      fileContent(
        useReviewRuntimeStore.getState().editorRuntimes[ownerKey]?.workspace,
        "models/base_item.py",
      ),
    ).toBeNull();
    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspaceOrigin).toBe("starter");
    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.userEdited).toBe(false);
    expect(useReviewRuntimeStore.getState().tool.boundExerciseKey).toBe(ownerKey);
    expect(useReviewRuntimeStore.getState().resetRevision).toBe(1);

    runtime.patchExercise(ownerKey, {
      generation: 0,
      updateOrigin: "quiz-practice-hydrate",
      workspaceMutation: {
        generation: 0,
        source: "quiz-practice-hydrate",
        mutation: "hydrate",
      },
      workspace: learnerWorkspace,
      codeWorkspace: learnerWorkspace,
      ideWorkspace: learnerWorkspace,
      code: "from models.car import Car\n\nprint('learner edit')\n",
      source: "from models.car import Car\n\nprint('learner edit')\n",
      workspaceOrigin: "saved",
      userEdited: true,
    });

    expect(fileContent(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace, "models/car.py")).toBe(
      "class Car:\n    def __init__(self, make, model, miles):\n        self.make = make\n        self.model = model\n        self.miles = miles\n",
    );
  });

  it("rejects workspace-bearing patches without a generation but accepts metadata-only patches", () => {
    const ownerKey =
      "python:python-8-object-oriented-foundations:section:thinking-in-objects:card-2:read-values-from-car-objects";
    const starterWorkspace = makeWorkspace([
      { path: "main.py", content: 'from models.car import Car\n\nprint("starter")\n' },
      { path: "models/car.py", content: "class Car:\n    pass\n" },
    ]);

    const runtime = useReviewRuntimeStore.getState();
    runtime.ensureExercise({
      exerciseKey: ownerKey,
      subjectSlug: "python",
      moduleSlug: "python-8-object-oriented-foundations",
      sectionSlug: "section",
      topicId: "thinking-in-objects",
      cardId: "card-2",
      manifest: { workspace: starterWorkspace },
      saved: { workspace: starterWorkspace },
    });

    runtime.patchExercise(ownerKey, {
      workspace: starterWorkspace,
      codeWorkspace: starterWorkspace,
      ideWorkspace: starterWorkspace,
      code: 'from models.car import Car\n\nprint("starter")\n',
      source: 'from models.car import Car\n\nprint("starter")\n',
      updateOrigin: "user",
      userEdited: true,
      workspaceOrigin: "user",
    });

    expect(fileContent(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace, "main.py")).toBe(
      'from models.car import Car\n\nprint("starter")\n',
    );

    runtime.patchExercise(ownerKey, {
      workspaceStatus: "error",
      workspaceError: "metadata-only",
    });

    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspaceStatus).toBe("error");
    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspaceError).toBe("metadata-only");
  });

  it("applies SQL binding metadata once and treats an identical rebind as a no-op", () => {
    const exerciseKey =
      "sql:sql-data-management:module2:creating-tables-and-defining-columns:try-orders";
    const workspace = {
      ...makeWorkspace([
        {
          path: "schema.sql",
          content:
            "-- Provided setup\nCREATE TABLE orders (id INTEGER PRIMARY KEY);\n",
        },
        {
          path: "query.sql",
          content: "-- Verify the orders table\n",
        },
      ]),
      language: "sql" as const,
      entryFileId: "file:query.sql",
      activeFileId: "file:query.sql",
      openTabs: ["file:query.sql", "file:schema.sql"],
    };
    const runtime = useReviewRuntimeStore.getState();

    runtime.patchExercise(exerciseKey, {
      generation: 0,
      language: "sql",
      lang: "sql",
      workspace,
      codeWorkspace: workspace,
      ideWorkspace: workspace,
      code: "-- Verify the orders table\n",
      source: "-- Verify the orders table\n",
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "starter",
      userEdited: false,
    });

    const sqlBindingPatch = {
      generation: 0,
      language: "sql",
      lang: "sql",
      workspace,
      codeWorkspace: workspace,
      ideWorkspace: workspace,
      code: "-- Verify the orders table\n",
      source: "-- Verify the orders table\n",
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "starter",
      userEdited: false,
      ideConfig: {
        requires: {
          files: true,
          multiFile: true,
        },
      },
      sqlDialect: "sqlite",
      sqlDatasetId: "ddl_blank",
      sqlSchemaSql:
        "CREATE TABLE orders (id INTEGER PRIMARY KEY);",
      sqlSeedSql: "",
      sqlInitialTableSnapshots: {
        orders: {
          columns: ["id"],
          rows: [],
        },
      },
    } as any;

    runtime.patchExercise(exerciseKey, sqlBindingPatch);

    const afterFirstBind =
      useReviewRuntimeStore.getState().exercises[exerciseKey];
    expect(afterFirstBind?.sqlDialect).toBe("sqlite");
    expect(afterFirstBind?.sqlDatasetId).toBe("ddl_blank");
    expect(afterFirstBind?.ideConfig).toMatchObject({
      requires: {
        files: true,
        multiFile: true,
      },
    });

    runtime.patchExercise(exerciseKey, {
      ...sqlBindingPatch,
      updatedAt: Date.now() + 1,
    });

    expect(
      useReviewRuntimeStore.getState().exercises[exerciseKey],
    ).toBe(afterFirstBind);
  });

  it("keeps saved intentional blanks during saved hydration instead of repairing them as runtime shell", () => {
    const ownerKey =
      "python:python-8-object-oriented-foundations:section:thinking-in-objects:card-2:read-values-from-car-objects";
    const starterWorkspace = makeWorkspace([
      { path: "main.py", content: 'from models.car import Car\n\nprint("starter")\n' },
      { path: "models/car.py", content: "class Car:\n    pass\n" },
    ]);
    const savedBlankWorkspace = makeWorkspace([
      { path: "main.py", content: 'from models.car import Car\nprint(\"saved\")\n' },
      { path: "models/car.py", content: "" },
    ]);
    const runtime = useReviewRuntimeStore.getState();

    runtime.ensureEditorSource({
      ownerKey,
      ownerKind: "exercise",
      targetKey: ownerKey,
      toolScopeKey: ownerKey,
      language: "python",
      manifest: { workspace: starterWorkspace },
      entry: {
        item: { workspace: starterWorkspace },
      } as any,
      workspaceSeedMode: "starter",
    });

    runtime.patchEditorWorkspace(ownerKey, starterWorkspace, {
      generation: 0,
      source: "authoritative-reset",
      mutation: {
        generation: 0,
        source: "authoritative-reset",
        mutation: "reset",
      },
    });

    runtime.patchExercise(ownerKey, {
      generation: 0,
      updateOrigin: "review-progress-hydrate",
      workspaceMutation: {
        generation: 0,
        source: "review-progress-hydrate",
        mutation: "hydrate",
      },
      language: "python",
      lang: "python",
      workspace: savedBlankWorkspace,
      codeWorkspace: savedBlankWorkspace,
      ideWorkspace: savedBlankWorkspace,
      code: 'from models.car import Car\nprint(\"saved\")\n',
      source: 'from models.car import Car\nprint(\"saved\")\n',
      stdin: "",
      codeStdin: "",
      workspaceOrigin: "saved",
      userEdited: true,
    });

    expect(fileContent(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspace, "models/car.py")).toBe(
      "",
    );
    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.workspaceOrigin).toBe("saved");
    expect(useReviewRuntimeStore.getState().exercises[ownerKey]?.fileEditState?.["models/car.py"]?.hasUserEdited).toBe(
      true,
    );
  });

  it("atomically restores the active topic exercise to the authored starter", () => {
    const topicId = "creating-and-indexing-lists";
    const cardId = "sketch0";
    const exerciseId = "try-creating-and-indexing-lists-sketch0";
    const ownerKey = [
      "python-data-functions",
      "python-5-lists-tuples-and-dictionaries",
      "python-data-functions-python-5-list-basics",
      topicId,
      cardId,
      exerciseId,
    ].join(":");
    const otherOwnerKey = `${ownerKey}:other`;
    const starterCode = [
      "club1 = input()",
      "club2 = input()",
      "club3 = input()",
      "",
      "# Create a list named clubs containing the three inputs.",
      "# Print the whole list.",
      "",
    ].join("\n");
    const starterWorkspace = makeWorkspace([
      { path: "main.py", content: starterCode },
    ]);
    const learnerWorkspace = makeWorkspace([
      {
        path: "main.py",
        content: `${starterCode}THIS_MUST_DISAPPEAR_AFTER_RESET\n`,
      },
    ]);
    const runtime = useReviewRuntimeStore.getState();

    useReviewRuntimeStore.setState({
      subjectSlug: "python-data-functions",
      moduleSlug: "python-5-lists-tuples-and-dictionaries",
      sectionSlug: "python-data-functions-python-5-list-basics",
      targetRegistry: {
        byKey: {
          [`exercise:${ownerKey}`]: {
            targetKey: `exercise:${ownerKey}`,
            routeKey: `${topicId}/${cardId}/${exerciseId}`,
            targetKind: "exercise",
            sectionSlug: "python-data-functions-python-5-list-basics",
            topicId,
            topicSlug: topicId,
            cardId,
            cardType: "sketch",
            targetSlug: exerciseId,
            ownerKind: "exercise",
            ownerKey,
            cardKey: ownerKey.split(":").slice(0, 5).join(":"),
            toolScopeKey: ownerKey,
            exerciseId,
            exerciseStateKey: ownerKey,
            language: "python",
            starterWorkspace,
            toolManifest: {
              id: exerciseId,
              kind: "code_input",
              language: "python",
              workspace: starterWorkspace,
            },
            item: {
              id: exerciseId,
              kind: "code_input",
              language: "python",
              workspace: starterWorkspace,
            },
          } as any,
        },
        orderedKeys: [],
        byRoute: {},
      },
    } as any);

    runtime.ensureExercise({
      exerciseKey: ownerKey,
      subjectSlug: "python-data-functions",
      moduleSlug: "python-5-lists-tuples-and-dictionaries",
      sectionSlug: "python-data-functions-python-5-list-basics",
      topicId,
      cardId,
      manifest: {
        id: exerciseId,
        kind: "code_input",
        language: "python",
        workspace: starterWorkspace,
      },
    });
    runtime.ensureEditorSource({
      ownerKey,
      ownerKind: "exercise",
      targetKey: `exercise:${ownerKey}`,
      toolScopeKey: ownerKey,
      language: "python",
      manifest: { workspace: starterWorkspace },
      entry: { item: { workspace: starterWorkspace } } as any,
      workspaceSeedMode: "starter",
    });
    runtime.patchEditorWorkspace(ownerKey, learnerWorkspace, {
      generation: 0,
      source: "test-user-edit",
      mutation: {
        generation: 0,
        source: "test-user-edit",
        mutation: "user-content",
        changedFilePaths: ["main.py"],
      },
    });
    runtime.patchExercise(ownerKey, {
      generation: 0,
      workspace: learnerWorkspace,
      codeWorkspace: learnerWorkspace,
      ideWorkspace: learnerWorkspace,
      code: `${starterCode}THIS_MUST_DISAPPEAR_AFTER_RESET\n`,
      source: `${starterCode}THIS_MUST_DISAPPEAR_AFTER_RESET\n`,
      workspaceOrigin: "user",
      userEdited: true,
    });
    runtime.ensureExercise({
      exerciseKey: otherOwnerKey,
      subjectSlug: "python-data-functions",
      moduleSlug: "python-5-lists-tuples-and-dictionaries",
      sectionSlug: "python-data-functions-python-5-list-basics",
      topicId,
      cardId: "sketch1",
      manifest: {
        id: "other",
        kind: "code_input",
        language: "python",
        workspace: makeWorkspace([{ path: "main.py", content: "other\n" }]),
      },
    });
    useReviewRuntimeStore.setState({ activeExerciseKey: ownerKey });
    runtime.bindExerciseTool(ownerKey);

    const result = runtime.resetTopicToCanonicalState(topicId);
    const state = useReviewRuntimeStore.getState();
    const exercise = state.exercises[ownerKey];
    const editor = state.editorRuntimes[ownerKey];
    const presentation = resolveCanonicalExercisePresentation({
      exercise,
      resetRevision: state.resetRevision,
    });

    expect(result).toEqual({
      exerciseKey: ownerKey,
      resetRevision: 1,
      restored: true,
    });
    expect(state.resetRevision).toBe(1);
    expect(Object.keys(state.exercises)).toEqual([ownerKey]);
    expect(state.activeExerciseKey).toBe(ownerKey);
    expect(state.tool.boundExerciseKey).toBe(ownerKey);
    expect(fileContent(exercise?.workspace, "main.py")).toBe(starterCode);
    expect(fileContent(editor?.workspace, "main.py")).toBe(starterCode);
    expect(exercise?.workspaceGeneration).toBe(1);
    expect(editor?.workspaceGeneration).toBe(1);
    expect(exercise?.workspaceOrigin).toBe("starter");
    expect(editor?.workspaceOrigin).toBe("starter");
    expect(exercise?.userEdited).toBe(false);
    expect(editor?.userEdited).toBe(false);
    expect(editor?.workspaceApplyRevision).toBe(1);
    expect(presentation).toMatchObject({ status: "ready", ready: true });

    runtime.ensureExercise({
      exerciseKey: "python-data-functions:other-module:section:other-topic:card:other",
      subjectSlug: "python-data-functions",
      moduleSlug: "other-module",
      sectionSlug: "section",
      topicId: "other-topic",
      cardId: "card",
      manifest: {
        id: "other",
        kind: "code_input",
        language: "python",
        workspace: makeWorkspace([{ path: "main.py", content: "other module\n" }]),
      },
    });

    const moduleResult = runtime.resetModuleToCanonicalState();
    const moduleState = useReviewRuntimeStore.getState();
    expect(moduleResult).toEqual({
      exerciseKey: ownerKey,
      resetRevision: 2,
      restored: true,
    });
    expect(Object.keys(moduleState.exercises)).toEqual([ownerKey]);
    expect(fileContent(moduleState.exercises[ownerKey]?.workspace, "main.py")).toBe(
      starterCode,
    );
    expect(moduleState.exercises[ownerKey]?.workspaceGeneration).toBe(2);
    expect(moduleState.editorRuntimes[ownerKey]?.workspaceApplyRevision).toBe(2);
  });
});

describe("reviewRuntimeStore mounted editor replacement command", () => {
  beforeEach(() => {
    resetRuntimeStore();
  });

  it("increments only the mounted-editor apply revision and can reapply the same workspace", () => {
    const ownerKey = "exercise:reveal-fill";
    const workspace = makeWorkspace([
      { path: "main.py", content: "print('solution')\n" },
      { path: "models/car.py", content: "class Car:\n    pass\n" },
    ]);

    useReviewRuntimeStore.setState((state) => ({
      editorRuntimes: {
        ...state.editorRuntimes,
        [ownerKey]: {
          ownerKey,
          ownerKind: "exercise",
          targetKey: ownerKey,
          toolScopeKey: ownerKey,
          language: "python",
          workspaceStatus: "ready",
          workspaceSeedMode: "restored",
          workspaceOrigin: "user",
          userEdited: true,
          workspace,
          code: "print('solution')\n",
          stdin: "",
          updatedAt: Date.now(),
        },
      },
    }));

    const runtime = useReviewRuntimeStore.getState();

    runtime.patchEditorWorkspace(ownerKey, workspace, {
      generation: 0,
      source: "reveal-fill",
      applyToMountedEditor: true,
    });

    expect(
      useReviewRuntimeStore.getState().editorRuntimes[ownerKey]
        ?.workspaceApplyRevision,
    ).toBe(1);

    runtime.patchEditorWorkspace(ownerKey, workspace, {
      generation: 0,
      source: "reveal-fill",
      applyToMountedEditor: true,
    });

    expect(
      useReviewRuntimeStore.getState().editorRuntimes[ownerKey]
        ?.workspaceApplyRevision,
    ).toBe(2);

    runtime.patchEditorWorkspace(ownerKey, workspace, {
      generation: 0,
      source: "normal-sync",
    });

    expect(
      useReviewRuntimeStore.getState().editorRuntimes[ownerKey]
        ?.workspaceApplyRevision,
    ).toBe(2);
  });
});
