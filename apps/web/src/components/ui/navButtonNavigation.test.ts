import {
    describe,
    expect,
    it,
} from "vitest";

import {
    isAbsoluteHttpHref,
    resolveNavButtonNavigationKind,
} from "./navButtonNavigation";

describe("NavButton navigation ownership", () => {
    it.each([
        "https://student.zoeskoul.com/en/catalogs",
        "http://localhost:3002/fr/practice/daily",
    ])(
        "treats %s as a browser-level external navigation",
        (href) => {
            expect(isAbsoluteHttpHref(href)).toBe(true);
            expect(
                resolveNavButtonNavigationKind(href),
            ).toBe("external");
        },
    );

    it.each([
        "/catalogs",
        "subjects/python-v2/modules",
        { pathname: "/profile" },
    ])(
        "keeps %j on the application router",
        (href) => {
            expect(
                resolveNavButtonNavigationKind(href),
            ).toBe("router");
        },
    );

    it("preserves href-less buttons as local actions", () => {
        expect(
            resolveNavButtonNavigationKind(null),
        ).toBe("none");
    });
});
