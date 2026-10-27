import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./deleteOwnedBuildProject.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/[locale]/projects/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../../components/builder/DeleteBuildProjectButton.tsx", import.meta.url), "utf8");

describe("V12K12G owned project deletion", () => {
  it("requires verified identity, same origin, title confirmation and rate limiting", () => {
    for (const rule of ["enforceSameOriginPost(req)", "requireAuthority: true", "rateLimit(", "confirmTitle", "deleteOwnedBuildProject(prisma"]) {
      expect(api).toContain(rule);
    }
  });
  it("deletes canonical CodeProject transactionally and blocks financial/external side effects", () => {
    for (const rule of ["TransactionIsolationLevel.Serializable", "codeProject.deleteMany", "BUILD_DELETE_ORDERS_PRESENT", "BUILD_DELETE_EXTERNAL_CONNECTIONS", "BUILD_DELETE_EXTERNAL_RESOURCES", "BUILD_DELETE_ACTIVE_WORK", "commerceProviderRoute.deleteMany"]) {
      expect(source).toContain(rule);
    }
    expect(source).not.toContain("aiCreditLedger.delete");
  });
  it("renders project deletion outside the project navigation link", () => {
    expect(page).toContain("<DeleteBuildProjectButton");
    expect(client).toContain('method: "DELETE"');
    expect(client).toContain("window.prompt");
    expect(client).toContain("router.refresh()");
  });
});
