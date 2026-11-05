import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",import.meta.url),"utf8");
const agent = readFileSync(new URL("./zoeProjectAgentLoop.ts",import.meta.url),"utf8");

describe("P3B7E4B2E TanStack editing ownership and metering",()=>{
  it("checks owner permissions, CSRF, entitlement, archive and CAS before TanStack proposal",()=>{
    const start=route.indexOf("export async function POST");
    const tan=route.indexOf('if (project.stackId === "tanstack-start-v1")',start);
    expect(tan).toBeGreaterThan(start);
    for(const marker of ["enforceSameOriginPost(req)","loadCurrentBuildAccessSnapshot(req",
      "canEditWithAi","getBuildProjectCommand(","project.sourceVersion !== baseVersion",
      'project.status === "archived"']) expect(route.indexOf(marker,start)).toBeLessThan(tan);
  });
  it("uses the metered transport, the same source-inspection agent and a review-only proposal",()=>{
    const start=route.indexOf('if (project.stackId === "tanstack-start-v1")',route.indexOf("export async function POST"));
    const end=route.indexOf("// All retired runtimes remain blocked",start);
    const post=route.slice(start,end);
    for(const marker of ["resolveTanstackRequestedPage(project.workspace, requestedPage)",
      "requireZoeAiBillingOperationId", "resolveFirstReviewedPaidEditModel()",
      "createRequiredZoeBuildAssistantTransport", "generateTanstackAgentProposal",
      'send("proposal"', 'send("clarification"']) expect(post).toContain(marker);
    expect(post).not.toContain("saveBuildProjectSourceCommand");
    expect(post).not.toContain("commitVerifiedTanstackReviewedEdit");
  });
  it("keeps reviewed PATCH using verified candidate and CAS, without React Router prompts for TanStack",()=>{
    const patch=route.slice(route.indexOf("export async function PATCH"));
    expect(patch).toContain("commitVerifiedTanstackReviewedEdit");
    expect(patch).toContain("verifyTanstackWorkerEditCandidate");
    expect(patch).toContain("saveBuildProjectSourceCommand");
    expect(agent).toContain('input.project.stackId === "tanstack-start-v1"');
  });
});
