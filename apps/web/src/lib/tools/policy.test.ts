import { describe, expect, it } from "vitest";

import { toolsPolicyForSubject } from "./policy";

describe("toolsPolicyForSubject", () => {
    it("enables the code workspace for the Git curriculum profile", () => {
        expect(
            toolsPolicyForSubject("git-foundations", undefined, "git"),
        ).toEqual({ codeEnabled: true });
    });

    it("still honors an explicit authored tools override", () => {
        expect(
            toolsPolicyForSubject(
                "git-foundations",
                { tools: { codeEnabled: false } },
                "git",
            ),
        ).toEqual({ codeEnabled: false });
    });

    it("keeps non-programming profiles notes-only by default", () => {
        expect(
            toolsPolicyForSubject("writing", undefined, "writing"),
        ).toEqual({ codeEnabled: false });
    });
});
