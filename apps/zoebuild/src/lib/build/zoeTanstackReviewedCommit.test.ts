import { describe, expect, it, vi } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { sha256 } from "./zoeTargetedSourceEdit";
import { commitVerifiedTanstackReviewedEdit } from "./zoeTanstackReviewedCommit";

type ParametersOfCommit = Parameters<typeof commitVerifiedTanstackReviewedEdit>;
type Dependencies = ParametersOfCommit[1];
type Input = ParametersOfCommit[0];

const original = "import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/')({component:()=> <main>Before</main>});";
const changed = "import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/')({component:()=> <main>After</main>});";
function workspace(): WorkspaceStateV2 {
  const files = {
    "src/router.tsx":"export const router = {};",
    "src/routes/__root.tsx":"export const Route = {};",
    "src/routes/index.tsx":original,
  };
  const nodes: Record<string,unknown>[]=[];
  const folders=new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const parts=path.split("/"); let parentId:string|null=null;
    for (let i=0;i<parts.length-1;i++) {
      const key=parts.slice(0,i+1).join("/");
      if (!folders.has(key)) {
        const id=`folder:${key}`;folders.set(key,id);
        nodes.push({id,kind:"folder",name:parts[i],parentId,createdAt:1,updatedAt:1});
      }
      parentId=folders.get(key)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:parts.at(-1),parentId,content,createdAt:1,updatedAt:1});
  }
  const activeFileId="file:src/routes/index.tsx";
  return {version:2,language:"web",nodes,activeFileId,entryFileId:activeFileId,
    openTabs:[activeFileId],expanded:["folder:src"],stdin:"",leftPct:25} as unknown as WorkspaceStateV2;
}
const edits=()=>[{path:"src/routes/index.tsx",beforeSha256:sha256(original),content:changed}];
const build=():Input=>({userId:"owner-1",buildProjectId:"project-1",workspace:workspace(),
  edits:edits(),specification:{} as Input["specification"],sourceVersion:12,baseVersion:12,
  verificationId:"build-verify-1"});
const validReceipt=()=>({state:"passed",reason:"runner-passed",sourceVersion:12,
  verificationId:"build-verify-1",snapshotSha256:"a".repeat(64),artifactSha256:"b".repeat(64),
  capacitySource:null,browser:"not-run"} as const);
function deps(receipt: unknown = validReceipt()) {
  const verify=vi.fn(async (_request:Parameters<Dependencies["verify"]>[0]) =>
    receipt as Awaited<ReturnType<Dependencies["verify"]>>);
  const persist=vi.fn(async (_request:Parameters<Dependencies["persist"]>[0]) => ({sourceVersion:13}));
  return {verify,persist,dependencies:{verify,persist} as Dependencies};
}

describe("P3B7E4B2D trusted reviewed TanStack source commit",()=>{
  it("verifies only the current owner-read candidate, then saves the exact edited workspace with baseVersion CAS",async()=>{
    const input=build(), d=deps();
    const output=await commitVerifiedTanstackReviewedEdit(input,d.dependencies);
    expect(output).toMatchObject({kind:"saved",sourceVersion:13});
    expect(d.verify).toHaveBeenCalledTimes(1);
    expect(d.verify).toHaveBeenCalledWith(expect.objectContaining({
      userId:"owner-1",buildProjectId:"project-1",sourceVersion:12,
      verificationId:"build-verify-1",edits:edits(),workspace:input.workspace,
    }));
    expect(d.persist).toHaveBeenCalledTimes(1);
    const saved=d.persist.mock.calls[0]![0] as {workspace: WorkspaceStateV2; baseVersion:number};
    expect(saved.baseVersion).toBe(12);
    expect(saved.workspace.nodes.some(n=>n.kind==="file" && n.content===changed)).toBe(true);
    expect(input.workspace.nodes.some(n=>n.kind==="file" && n.content===original)).toBe(true);
    expect(input.workspace.nodes.some(n=>n.kind==="file" && n.content===changed)).toBe(false);
    expect(d.verify.mock.invocationCallOrder[0]).toBeLessThan(d.persist.mock.invocationCallOrder[0]);
  });
  it("rejects stale base versions and stale file hashes before contacting the Runner",async()=>{
    for (const changedInput of [
      {...build(),baseVersion:11},
      {...build(),edits:[{...edits()[0],beforeSha256:"0".repeat(64)}]},
    ]) {
      const d=deps();
      await expect(commitVerifiedTanstackReviewedEdit(changedInput,d.dependencies)).rejects.toThrow();
      expect(d.verify).not.toHaveBeenCalled();
      expect(d.persist).not.toHaveBeenCalled();
    }
  });
  it("never commits a failed build, an outage, or a capacity failure",async()=>{
    for (const receipt of [
      {...validReceipt(),state:"failed",reason:"runner-build-rejected",artifactSha256:null},
      {...validReceipt(),state:"not-run",reason:"runner-timeout",artifactSha256:null},
      {...validReceipt(),state:"not-run",reason:"capacity",artifactSha256:null},
    ]) {
      const d=deps(receipt);
      expect(await commitVerifiedTanstackReviewedEdit(build(),d.dependencies)).toMatchObject({kind:"not-verified"});
      expect(d.persist).not.toHaveBeenCalled();
    }
  });
  it("rejects forged or mismatched receipts even when the state says passed",async()=>{
    for (const receipt of [
      {...validReceipt(),sourceVersion:11},
      {...validReceipt(),verificationId:"another-request"},
      {...validReceipt(),reason:"runner-transport"},
      {...validReceipt(),snapshotSha256:"invalid"},
      {...validReceipt(),artifactSha256:null},
      {...validReceipt(),browser:"passed"},
    ]) {
      const d=deps(receipt);
      const outcome=await commitVerifiedTanstackReviewedEdit(build(),d.dependencies);
      expect(outcome).toMatchObject({kind:"not-verified",verification:{state:"not-run",reason:"runner-response-mismatch"}});
      expect(d.persist).not.toHaveBeenCalled();
    }
  });
  it("keeps a save-time race fail closed; compilation cannot override the transactional CAS",async()=>{
    const d=deps();
    const conflict=new Error("BUILD_SOURCE_CONFLICT");
    const persist=vi.fn(async (_request:Parameters<Dependencies["persist"]>[0])=>{throw conflict;});
    await expect(commitVerifiedTanstackReviewedEdit(build(),{...d.dependencies,persist})).rejects.toBe(conflict);
    expect(d.verify).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it("reports project disappearance without claiming saved source",async()=>{
    const d=deps();const persist=vi.fn(async (_request:Parameters<Dependencies["persist"]>[0])=>null);
    expect(await commitVerifiedTanstackReviewedEdit(build(),{...d.dependencies,persist})).toMatchObject({kind:"not-found"});
  });
  it("source route keeps generation gated, authorizes apply and uses the existing CAS writer",async()=>{
    const fs=await import("node:fs");
    const source=fs.readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",import.meta.url),"utf8");
    const post=source.slice(source.indexOf("export async function POST("),source.indexOf("export async function PATCH("));
    const patch=source.slice(source.indexOf("export async function PATCH("));
    expect(post).toContain("zoeTanstackEditRuntimeGate(project.stackId)");
    expect(post).not.toContain("commitVerifiedTanstackReviewedEdit(");
    expect(patch).toContain('if (project.stackId === "tanstack-start-v1")');
    expect(patch).toContain("commitVerifiedTanstackReviewedEdit(");
    expect(patch).toContain("verify:verifyTanstackWorkerEditCandidate");
    expect(patch).toContain("saveBuildProjectSourceCommand({");
    expect(patch).toContain("createPrismaBuildProjectSourceWriter(prisma)");
    expect(patch).toContain('code:"BUILD_EDIT_BUILD_NOT_VERIFIED"');
  });
});
