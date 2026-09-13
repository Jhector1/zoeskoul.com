import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";
import { useReviewRuntimeStore } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRuntimeStore";
import { resolveMountedEditorOwner } from "@zoeskoul/learning-runtime/review/mountedEditorOwner";
import { applyCanonicalResetToToolBinding } from "@zoeskoul/learning-runtime/review/toolStarterIdentity";
import { resolveReadyWorkspaceReplacementRevision, shouldHydrateWorkspaceSnapshot } from "@zoeskoul/learner-workspace/ide/fullide/externalWorkspaceControl";
import { buildWorkspaceModelReplacements, replaceMountedWorkspaceModels } from "@zoeskoul/learner-workspace/runner/components/EditorPane";

const topicId = "creating-and-indexing-lists";
const cardId = `${topicId}_s1`;
const exerciseId = "try-creating-and-indexing-lists-sketch0";
const prefix = "python-data-functions:python-5-lists-tuples-and-dictionaries:python-data-functions-python-5-list-basics";
const owner = `${prefix}:${topicId}:${cardId}:${exerciseId}`;
const readingOwner = `${prefix}:${topicId}:${topicId}_s0`;
const starter = "club1 = input()\nclub2 = input()\nclub3 = input()\n\n# Create a list named clubs containing the three inputs.\n# Print the whole list.\n";

function workspace(code: string): WorkspaceStateV2 {
    return {
        version: 2, language: "python",
        nodes: [{ id: "file:main.py", kind: "file", name: "main.py", parentId: null, content: code, createdAt: 0, updatedAt: 0 }],
        openTabs: ["file:main.py"], activeFileId: "file:main.py", entryFileId: "file:main.py",
        stdin: "", expanded: [], leftPct: 26,
    };
}

describe("authoritative reset through the persistent workspace and mounted model", () => {
    beforeEach(() => {
        useReviewRuntimeStore.setState({
            subjectSlug: "python-data-functions", moduleSlug: "python-5-lists-tuples-and-dictionaries",
            sectionSlug: "python-data-functions-python-5-list-basics", activeTopicId: topicId,
            activeExerciseKey: null, resetRevision: 0, cards: {}, exercises: {}, editorRuntimes: {},
            boundToolWorkspace: null, tool: { boundExerciseKey: null }, targetRegistry: null,
            persistence: { dirty: false, pendingExerciseKeys: new Set(), pendingCardKeys: new Set() },
        });
    });

    it.each(["exercise", "topic", "module"] as const)("applies %s reset before acknowledgement, survives unbinding, and accepts the next edit", scope => {
        const api = useReviewRuntimeStore.getState();
        const authored = workspace(starter);
        const dirty = workspace(`${starter}ffggggfff\n`);
        api.ensureExercise({ exerciseKey: owner, subjectSlug: "python-data-functions", moduleSlug: "python-5-lists-tuples-and-dictionaries", sectionSlug: "python-data-functions-python-5-list-basics", topicId, cardId, manifest: { id: exerciseId, kind: "code_input", language: "python", workspace: authored } });
        api.ensureEditorSource({ ownerKey: owner, ownerKind: "exercise", targetKey: `exercise:${owner}`, toolScopeKey: owner, language: "python", manifest: { workspace: authored }, workspaceSeedMode: "starter", entry: { item: { workspace: authored } } as any });
        api.patchEditorWorkspace(owner, dirty, { generation: 0, source: "code-tool-emit-upstream", mutation: { generation: 0, source: "code-tool-emit-upstream", mutation: "user-content", changedFilePaths: ["main.py"] } });
        // A restored legacy progress snapshot may have mislabeled learner code
        // as its starter. The actual authored manifest remains the reset source.
        useReviewRuntimeStore.setState(s => ({ activeExerciseKey: owner, exercises: { ...s.exercises, [owner]: { ...s.exercises[owner]!, starterWorkspace: dirty, starterHash: JSON.stringify(dirty) } } }));
        api.bindExerciseTool(owner);

        const modelPath = buildWorkspaceModelReplacements({ workspace: authored, exerciseStateKey: owner })[0]!.path;
        let visibleCode = `${starter}ffggggfff\n`;
        const model = { isDisposed: () => false, getValue: () => visibleCode, setValue: (code: string) => { visibleCode = code; } };
        const monaco = { Uri: { parse: (path: string) => path }, editor: { getModel: (path: string) => path === modelPath ? model : null } };
        const previous = { resetRevision: 0, scopeKey: owner, resetOwnerKey: null };
        const lastHydratedKey = JSON.stringify(authored);
        let committed = dirty;

        if (scope === "exercise") api.resetExerciseToStarter({ topicId, cardId, exerciseId, exerciseStateKey: owner });
        else if (scope === "topic") api.resetTopicToCanonicalState(topicId);
        else api.resetModuleToCanonicalState();

        const reset = useReviewRuntimeStore.getState();
        const command = reset.editorRuntimes[owner]!;
        expect(reset.exercises[owner]!.code).toBe(starter);
        expect(command.workspace).toEqual(authored);
        expect(command.starterHash).not.toContain("ffggggfff");
        expect(reset.exercises[owner]!.starterHash).toBe(command.starterHash);
        expect(command.workspaceApplyRevision).toBe(1);
        expect(reset.resetRevision).toBe(1);
        const staleBinding = { workspace: dirty, code: `${starter}ffggggfff\n`, userEdited: true, workspaceOrigin: "user" as const, preferSnapshot: true };
        const resetBinding = applyCanonicalResetToToolBinding(staleBinding, reset.exercises[owner]);
        expect(resetBinding.workspace).toEqual(authored);
        expect(resetBinding.code).toBe(starter);
        expect(resetBinding.userEdited).toBe(false);
        // A terminal-evidence-only update merges into this canonical registry
        // baseline, not the registration's pre-reset learner workspace.
        api.patchExercise(owner, { ...resetBinding, generation: 1, terminalEvidence: { commands: [], outputText: "" } });
        expect(useReviewRuntimeStore.getState().exercises[owner]!.workspace).toEqual(authored);

        // Navigation/unbinding is allowed to happen before the mounted model
        // acknowledges the command. An empty reading card must not steal it.
        api.unbindExerciseTool(owner);
        const reading = { ...command, ownerKey: readingOwner, ownerKind: "card" as const, workspaceOrigin: "empty" as const, workspace: workspace("") };
        const presentation = resolveMountedEditorOwner({ previous, requestedScopeKey: `card:${readingOwner}`, resetRevision: reset.resetRevision, editors: { ...reset.editorRuntimes, [readingOwner]: reading } });
        expect(presentation.scopeKey).toBe(owner);
        expect(resolveMountedEditorOwner({ previous, requestedScopeKey: `card:${readingOwner}`, resetRevision: reset.resetRevision, editors: reset.editorRuntimes }).scopeKey).toBe(owner);
        // Ordinary navigation and a real authored destination still take ownership.
        expect(resolveMountedEditorOwner({ previous, requestedScopeKey: `card:${readingOwner}`, resetRevision: 0, editors: { ...reset.editorRuntimes, [readingOwner]: reading } }).scopeKey).toBe(`card:${readingOwner}`);
        expect(resolveMountedEditorOwner({ previous: presentation, requestedScopeKey: `card:${readingOwner}`, resetRevision: 1, editors: { ...reset.editorRuntimes, [readingOwner]: { ...reading, workspaceOrigin: "starter" } } }).scopeKey).toBe(`card:${readingOwner}`);

        const revision = `${owner}:apply:${command.workspaceApplyRevision}`;
        const requestedWorkspaceKey = JSON.stringify(command.workspace);
        expect(resolveReadyWorkspaceReplacementRevision({ revision, requestedWorkspaceKey, committedWorkspaceKey: JSON.stringify(committed) })).toBeUndefined();
        expect(visibleCode).toContain("ffggggfff");
        expect(shouldHydrateWorkspaceSnapshot({ currentKey: JSON.stringify(committed), nextKey: requestedWorkspaceKey, lastHydratedKey, authoritative: true })).toBe(true);
        committed = command.workspace!;
        const ready = resolveReadyWorkspaceReplacementRevision({ revision, requestedWorkspaceKey, committedWorkspaceKey: JSON.stringify(committed) });
        expect(ready).toBe(revision);
        let acknowledged: string | number | undefined;
        if (ready) {
            replaceMountedWorkspaceModels({ monaco, replacements: buildWorkspaceModelReplacements({ workspace: committed, exerciseStateKey: presentation.scopeKey }) });
            acknowledged = ready;
        }
        expect(acknowledged).toBe(revision);
        expect(visibleCode).toBe(starter);

        const nextCode = `${starter}print(club1)\n`;
        model.setValue(nextCode);
        api.patchEditorWorkspace(presentation.scopeKey, workspace(nextCode), { generation: reset.resetRevision, source: "code-tool-emit-upstream", mutation: { generation: reset.resetRevision, source: "code-tool-emit-upstream", mutation: "user-content", changedFilePaths: ["main.py"] } });
        expect(useReviewRuntimeStore.getState().editorRuntimes[owner]!.code).toBe(nextCode);
        expect(useReviewRuntimeStore.getState().exercises[owner]!.workspaceOrigin).toBe("user");
        expect(visibleCode).toBe(nextCode);
        expect(useReviewRuntimeStore.getState().editorRuntimes[owner]!.workspaceApplyRevision).toBe(1);
        const editedBinding = { ...staleBinding, workspace: workspace(nextCode), code: nextCode };
        expect(applyCanonicalResetToToolBinding(editedBinding, useReviewRuntimeStore.getState().exercises[owner])).toBe(editedBinding);
    });
});
