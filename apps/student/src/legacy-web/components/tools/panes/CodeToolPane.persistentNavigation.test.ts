import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildPersistentFullIdeKey,
    shouldHoldPreviousCompatibleFullIde,
} from "./CodeToolPane";

describe("persistent Review CodeToolPane FullIDE navigation", () => {
    const base = {
        hardBoundaryKey: "review:python:module-2",
        runtimeLanguage: "python",
        servicePreset: "runner",
    };

    it("does not remount for exercise-authored service-preset changes", () => {
        expect(
            buildPersistentFullIdeKey({
                ...base,
                servicePreset: "terminal",
            }),
        ).toBe(buildPersistentFullIdeKey(base));
    });

    it("remounts only for real host ownership or language boundaries", () => {
        const current = buildPersistentFullIdeKey(base);

        expect(
            buildPersistentFullIdeKey({
                ...base,
                hardBoundaryKey: "review:python:module-3",
            }),
        ).not.toBe(current);
        expect(
            buildPersistentFullIdeKey({
                ...base,
                runtimeLanguage: "javascript",
            }),
        ).not.toBe(current);
    });

    it("uses a nonblocking transition indicator instead of a full editor mask", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/legacy-web/components/tools/panes/CodeToolPane.tsx"),
            "utf8",
        );
        const marker = 'data-testid="review-editor-transition-loading"';
        const at = source.indexOf(marker);
        expect(at).toBeGreaterThan(0);

        const tagStart = source.lastIndexOf("<", at);
        const tagEnd = source.indexOf(">", at);
        expect(tagStart).toBeGreaterThanOrEqual(0);
        expect(tagEnd).toBeGreaterThan(at);

        const loadingTag = source.slice(tagStart, tagEnd + 1);
        expect(loadingTag).toContain("pointer-events-none");
        expect(loadingTag).toContain("right-3");
        expect(loadingTag).toContain("top-3");
        expect(loadingTag).not.toContain("absolute inset-0");
    });
    it("holds the last ready compatible FullIDE only for an ordinary same-host wait", () => {
        expect(
            shouldHoldPreviousCompatibleFullIde({
                isReviewRouteMode: true,
                canRenderEditor: false,
                showLoadingMask: true,
                currentFullIdeKey: "review:language:python",
                previousFullIdeKey: "review:language:python",
            }),
        ).toBe(true);

        expect(
            shouldHoldPreviousCompatibleFullIde({
                isReviewRouteMode: true,
                canRenderEditor: false,
                showLoadingMask: true,
                currentFullIdeKey: "review:language:javascript",
                previousFullIdeKey: "review:language:python",
            }),
        ).toBe(false);

        expect(
            shouldHoldPreviousCompatibleFullIde({
                isReviewRouteMode: true,
                canRenderEditor: false,
                showLoadingMask: false,
                currentFullIdeKey: "review:language:python",
                previousFullIdeKey: "review:language:python",
            }),
        ).toBe(false);
    });

    it("keeps FullIDE mounted and immutable while a compatible destination resolves", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/legacy-web/components/tools/panes/CodeToolPane.tsx"),
            "utf8",
        );

        expect(source).toContain(
            "const shouldRenderFullIde = Boolean(activeFullIdePresentation)",
        );
        expect(source).toContain("{shouldRenderFullIde ? (");
        expect(source).not.toContain(
            "{canRenderEditor ? (\n                    <FullIDE",
        );
        expect(source).toContain(
            "initialWorkspace={presentedFullIdeWorkspace}",
        );
        expect(source).toContain(
            "exerciseStateKey={presentedFullIdeExerciseStateKey}",
        );
        expect(source).toContain(
            "review-tool:${presentedFullIdeWorkspaceOwnerIdentityKey}",
        );
        expect(source).toContain(
            "coordinatedEditorLoading ||\n                            holdPreviousCompatibleFullIde",
        );
    });

    it("does not cover a retained editor with legacy full-screen wait masks", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/legacy-web/components/tools/panes/CodeToolPane.tsx"),
            "utf8",
        );
        expect(source).toContain(
            "pendingExerciseBinding &&\n                !canRenderEditor &&\n                !holdPreviousCompatibleFullIde",
        );
        expect(source).toContain(
            "showLoadingMask &&\n                    !holdPreviousCompatibleFullIde",
        );
        expect(source).toContain(
            "coordinatedEditorLoading || holdPreviousCompatibleFullIde",
        );
    });

});

describe("CodeToolPane canonical exercise presentation ownership", () => {
    it("uses the shared ExerciseRuntime presentation contract for exercise mode", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/legacy-web/components/tools/panes/CodeToolPane.tsx"),
            "utf8",
        );

        expect(source).toContain("resolveCanonicalExercisePresentation({");
        expect(source).toContain("const canonicalExercisePresentationReady =");
        expect(source).toContain("return exerciseRuntime?.workspace ?? null;");
    });

    it("does not let tool binding or destination loading hide a ready exercise", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/legacy-web/components/tools/panes/CodeToolPane.tsx"),
            "utf8",
        );

        expect(source).toContain(
            "!toolHydrated &&\n        !canonicalExercisePresentationReady",
        );
        expect(source).toContain(
            "pendingExerciseBinding &&\n        !canonicalExercisePresentationReady",
        );
        expect(source).toContain(
            "destinationTransition?.showEditorLoading &&\n        !canonicalExercisePresentationReady",
        );
    });

    it("preserves previous compatible FullIDE only as visual continuity", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/legacy-web/components/tools/panes/CodeToolPane.tsx"),
            "utf8",
        );

        expect(source).toContain("shouldHoldPreviousCompatibleFullIde({");
        expect(source).toContain("holdPreviousCompatibleFullIde");
        expect(source).toContain('data-testid="review-editor-transition-loading"');
    });
});
