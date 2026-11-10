import { describe, expect, it } from "vitest";
import { v6ExplorerFailureMessage } from "./v6ExplorerFeedback";

describe("V6 explorer failure recovery guidance", () => {
    it("preserves draft and explains a concurrent local edit", () => {
        expect(v6ExplorerFailureMessage({code:"LOCAL_DRAFT_CHANGED"})).toContain("local draft is preserved");
    });
    it("does not describe a failed CAS flush as a successful save", () => {
        const text = v6ExplorerFailureMessage({code:"LOCAL_SYNC_FAILED"});
        expect(text).toContain("could not be fully synchronized");
        expect(text).toContain("folder operation was not attempted");
        expect(text).toContain("Some earlier file changes may already have synced");
    });
    it("does not encourage blind retries after ambiguous commits", () => {
        expect(v6ExplorerFailureMessage({code:"RECONCILIATION_REQUIRED"})).toContain("No automatic retry");
    });
    it("explains terminal-side conflicts without data loss", () => {
        expect(v6ExplorerFailureMessage(new Error("Workspace file operation failed (CONFLICT)")))
            .toContain("No newer data was overwritten");
    });
    it("handles unknown errors without claiming discarded edits", () => {
        expect(v6ExplorerFailureMessage(new Error("Connection dropped")))
            .toContain("editor changes were not discarded");
    });
});
