import { describe, expect, it } from "vitest";

import { buildBillingHref, safeInternalPath } from "./moduleAccess";

describe("buildBillingHref", () => {
    it("includes next, back, reason, subject, and module for unlock redirects", () => {
        expect(
            buildBillingHref({
                locale: "en",
                next: "/subjects/python/modules/python-module-2/learn",
                back: "/subjects/python/modules/python-module-1/learn",
                reason: "module",
                subject: "python",
                module: "python-module-2",
            }),
        ).toBe(
            "/billing?next=%2Fsubjects%2Fpython%2Fmodules%2Fpython-module-2%2Flearn&back=%2Fsubjects%2Fpython%2Fmodules%2Fpython-module-1%2Flearn&reason=module&subject=python&module=python-module-2",
        );
    });
});

describe("safeInternalPath", () => {
    it("keeps safe internal paths and rejects external ones", () => {
        expect(safeInternalPath("/billing")).toBe("/billing");
        expect(safeInternalPath("subjects/python")).toBe("/subjects/python");
        expect(safeInternalPath("https://evil.example/path", "/fallback")).toBe("/fallback");
        expect(safeInternalPath("//evil.example/path", "/fallback")).toBe("/fallback");
    });
});
