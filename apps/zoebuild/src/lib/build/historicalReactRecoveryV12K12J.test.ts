import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const restore = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/source-history/route.ts",import.meta.url),"utf8");
const writer = readFileSync(new URL("./restoreHistoricalReactRevision.ts",import.meta.url),"utf8");
const edit = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",import.meta.url),"utf8");

describe("V12K12J cross-stack React history recovery", () => {
  it("uses trusted stored historical stack metadata, not static stack verification", () => {
    expect(writer).toContain('source?.stackId !== "react-vite-v1"');
    expect(writer).toContain('revision?.stackId !== "react-vite-v1"');
    expect(restore).toContain('historicalReactSourceMetadata(revision.settings, revision.meta)');
    expect(restore).toContain('const specification = historicReactRecoverySpecification(project.title)');
  });
  it("verifies the saved historical React snapshot in runner before any write", () => {
    const branch = restore.slice(restore.indexOf('if (project.stackId !== "react-vite-v1")'));
    expect(branch.indexOf('verification.state !== "passed"')).toBeLessThan(branch.indexOf('await restoreHistoricalReactRevision(prisma'));
    expect(branch).toContain('workspace,edits:[],specification,sourceVersion:project.sourceVersion');
    expect(writer).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(writer).toContain('createRevision: true');
    expect(writer).toContain('baseVersion: args.expectedVersion');
    expect(writer).toContain('status: "draft"');
  });
  it("does not permit vanilla/static editing at either paid-edit boundary", () => {
    // Both paid edit boundaries handle TanStack through the verified path and
    // reject retired stacks before reaching the dormant legacy implementation.
    expect(edit.match(/project.stackId === "tanstack-start-v1"/g)?.length).toBe(2);
    expect(edit.match(/zoeTanstackEditRuntimeGate\(project.stackId\)/g)?.length).toBe(2);
    expect(edit).toContain('if (runtimeGate) return result(requestId');
  });
});
