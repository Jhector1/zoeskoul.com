import { describe, expect, it } from "vitest";

import { isWorkspaceInternalPath } from "./workspaceInternalPaths";

describe("isWorkspaceInternalPath", () => {
    it("recognizes platform and Git-managed path segments", () => {
        expect(isWorkspaceInternalPath(".zoeskoul/setup.sh")).toBe(true);
        expect(isWorkspaceInternalPath("trail-journal/.git/HEAD")).toBe(true);
        expect(isWorkspaceInternalPath("trail-journal\\.git\\config")).toBe(true);
    });

    it("keeps ordinary dotfiles such as .gitignore visible", () => {
        expect(isWorkspaceInternalPath("trail-journal/.gitignore")).toBe(false);
        expect(isWorkspaceInternalPath("trail-journal/README.md")).toBe(false);
    });
});
