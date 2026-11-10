import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./LearningVisibilityPage.tsx", import.meta.url), "utf8");

describe("Learning visibility Admin app ownership", () => {
  it("uses the centralized admin API client and does not access Prisma", () => {
    expect(source).toContain('adminApi(apiOrigin).request<LearningVisibilityChangeResponse>');
    expect(source).toContain('useAdminResource<LearningVisibilityAdminResponse>');
    expect(source).not.toContain('prisma.');
  });
  it("does not optimistically mark a failed request as successful", () => {
    expect(source.indexOf('setItems(current =>')).toBeGreaterThan(source.indexOf('result.ok !== true'));
  });
});
