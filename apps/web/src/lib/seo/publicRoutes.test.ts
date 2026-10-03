import { describe, expect, it } from "vitest";
import { ROUTES } from "@zoeskoul/app-config";
import { PUBLIC_INDEXABLE_ROUTES, PUBLIC_NOINDEX_ROUTES } from "./publicRoutes";

describe("public SEO route policy", () => {
  it("indexes acquisition pages and public sandbox discovery pages", () => {
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/learn");
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/students");
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/teachers");
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/schools");
    expect(PUBLIC_INDEXABLE_ROUTES).toContain(ROUTES.sandbox);
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/sandbox/programming");
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/learn/python");
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/learn/sql");
  });

  it("keeps legal compliance pages outside the acquisition index set", () => {
    expect(PUBLIC_INDEXABLE_ROUTES).not.toContain(ROUTES.privacy);
    expect(PUBLIC_INDEXABLE_ROUTES).not.toContain(ROUTES.terms);
    expect(PUBLIC_NOINDEX_ROUTES).toContain(ROUTES.privacy);
    expect(PUBLIC_NOINDEX_ROUTES).toContain(ROUTES.terms);
  });
});
