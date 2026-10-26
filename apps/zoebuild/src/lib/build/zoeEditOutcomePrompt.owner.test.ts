import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts", import.meta.url), "utf8");
describe("E17F grounded edit quality and contrast", () => {
  it("keeps requested outcome and location distinct from edited source filenames", () => {
    expect(source).toContain("A footer link is not the same as a page section");
    expect(source).toContain("Match the exact user-requested visible outcome");
  });
  it("requests contrast without editing generated storefront styles by default", () => {
    expect(source).toContain("white-on-white controls");
    expect(source).toContain("Respect the existing design unless the user requests a new one");
  });
  it("prohibits claiming visual success from source proposal alone", () => {
    expect(source).toContain("Do not claim the rendered preview was inspected");
  });
});
