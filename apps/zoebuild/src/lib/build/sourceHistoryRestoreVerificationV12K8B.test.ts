import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/source-history/route.ts",import.meta.url),"utf8");
const restoreWriter = readFileSync(new URL("./restoreSavedReactVersion.ts",import.meta.url),"utf8");

describe("historical source restore activation", () => {
  it("uses the owner-protected saved snapshot writer without runner compile gate for React revisions", () => {
    const branch = route.slice(route.indexOf("// V1 through the latest React version:"));
    expect(branch).toContain("await restoreSavedReactVersion(prisma");
    expect(branch).not.toContain("verifyZoeReactCandidateAtRunner");
    expect(branch).toContain("buildVerified:false");
  });
  it("checks the current version and uses serializable optimistic concurrency", () => {
    expect(route).toContain("project.sourceVersion !== restore.baseVersion");
    expect(restoreWriter).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(restoreWriter).toContain("current.codeProject.currentVersion !== args.expectedVersion");
    expect(restoreWriter).toContain("baseVersion: args.expectedVersion");
  });
  it("reads old source/settings only from an owned persisted revision", () => {
    expect(restoreWriter).toContain("tx.codeProjectRevision.findUnique");
    expect(restoreWriter).toContain("historicalReactSourceMetadata(previous.settings, previous.meta)");
    expect(restoreWriter).toContain("parseBuildWorkspaceMutation(previous.snapshot)");
    expect(restoreWriter).toContain("settings: json(savedSettings)");
    // A version selection updates the head with CAS but must not add a saved revision.
    expect(restoreWriter).toContain("createRevision: false");
    expect(route).not.toContain("decoded.workspace");
  });
});
