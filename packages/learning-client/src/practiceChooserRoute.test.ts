import { describe, expect, it } from "vitest";

import {
  buildPracticeChooserRouteHref,
  parsePracticeChooserRoutePathname,
} from "./practiceChooserRoute";

describe("Practice chooser browser route codec", () => {
  it.each([
    [
      {
        locale: "en",
        selection: {
          catalogSlug: "",
          subjectSlug: "",
          moduleSlug: "",
        },
      },
      "/en/practice/daily",
      "root",
    ],
    [
      {
        locale: "fr",
        selection: {
          catalogSlug: "python",
          subjectSlug: "",
          moduleSlug: "",
        },
      },
      "/fr/practice/daily/catalog/python",
      "catalog",
    ],
    [
      {
        locale: "ht",
        selection: {
          catalogSlug: "python",
          subjectSlug: "python-v2",
          moduleSlug: "",
        },
      },
      "/ht/practice/daily/catalog/python/course/python-v2",
      "course",
    ],
    [
      {
        locale: "es",
        selection: {
          catalogSlug: "sql",
          subjectSlug: "sql-v2",
          moduleSlug: "sql-v2-2",
        },
      },
      "/es/practice/daily/catalog/sql/course/sql-v2/module/sql-v2-2",
      "module",
    ],
  ] as const)("round-trips %s", (args, expectedHref, expectedDepth) => {
    const href = buildPracticeChooserRouteHref(args);
    expect(href).toBe(expectedHref);
    expect(parsePracticeChooserRoutePathname(href)).toEqual({
      locale: args.locale,
      depth: expectedDepth,
      selection: args.selection,
    });
  });

  it.each([
    "/en/practice/daily/extra",
    "/en/practice/daily/catalog",
    "/en/practice/daily/catalog/python/extra",
    "/en/practice/daily/catalog/python/course",
    "/en/practice/daily/catalog/python/course/python-v2/extra",
    "/en/practice/daily/catalog/python/course/python-v2/module",
    "/en/practice/daily/catalog/python/course/python-v2/module/m1/extra",
    "/en/practice/daily/catalog/%2F/course/python-v2",
  ])("rejects non-canonical chooser path %s", (pathname) => {
    expect(parsePracticeChooserRoutePathname(pathname)).toBeNull();
  });

  it("refuses impossible hierarchy builds", () => {
    expect(() =>
      buildPracticeChooserRouteHref({
        locale: "en",
        selection: {
          catalogSlug: "",
          subjectSlug: "python-v2",
          moduleSlug: "python-v2-1",
        },
      }),
    ).toThrow("requires catalog");

    expect(() =>
      buildPracticeChooserRouteHref({
        locale: "en",
        selection: {
          catalogSlug: "python",
          subjectSlug: "",
          moduleSlug: "python-v2-1",
        },
      }),
    ).toThrow("requires course");
  });
});
