import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    resolve(process.cwd(), "packages/learner-workspace/src/fullide/FullIDE.tsx"),
    "utf8",
);

describe("persistent FullIDE Review navigation source contract", () => {
    it("keeps controlled target identity out of the FullIDEInner React mount key", () => {
        expect(source).toContain(
            "hasExternalWorkspaceProp ||",
        );
        expect(source).toContain(
            'String(props.projectScope?.scopeKey ?? "").startsWith("review-tool:")',
        );
        expect(source).not.toContain('props.exerciseStateKey ?? "none"');
    });

    it("keeps review-tool on the persistent inner FullIDE ownership path", () => {
        expect(source).toContain(
            'String(props.projectScope?.scopeKey ?? "").startsWith("review-tool:")',
        );
        expect(source).toContain(
            "buildFullIdeSessionRemountKey",
        );
    });

    it("hides Explorer chrome for single-file exercise presentations without changing editor ownership", () => {
        expect(source).toContain(
            "const learnerVisibleFileCount = learnerWorkspace.nodes.reduce",
        );
        expect(source).toContain(
            "(!exerciseStateKey || learnerVisibleFileCount > 1)",
        );
        expect(source).toContain(
            "explorer={explorerAvailable ? explorerPane : null}",
        );
        expect(source).toContain("{viewport.isDesktop ? (");
        expect(source).not.toContain(
            "explorerAvailable && viewport.isDesktop ?",
        );
    });

    it("does not move the editor between different layout parents when Explorer toggles", () => {
        expect(source).not.toContain(
            "services.explorer.enabled && viewport.isDesktop",
        );
        expect(source).toContain(
            "explorer={explorerAvailable ? explorerPane : null}",
        );
    });

    it("marks a committed read-only external workspace replacement as clean hydration", () => {
        expect(source).toContain("dirty.markLoaded(currentWorkspace)");
        expect(source).toContain(
            'typeof workspaceReplacementRevision === "undefined"',
        );
        expect(source).toContain("!readOnly");
    });
});
