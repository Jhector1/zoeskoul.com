import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { sha256 } from "./zoeTargetedSourceEdit";
import { prepareTanstackWorkerEditCandidate, verifyTanstackWorkerEditCandidate } from "./zoeTanstackWorkerCandidate";

type Params = Parameters<typeof verifyTanstackWorkerEditCandidate>[0];
type Dependencies = NonNullable<Params["dependencies"]>;

function workspace(): WorkspaceStateV2 {
  const files: Record<string, string> = {
    "src/router.tsx": "export const router = {};",
    "src/routes/__root.tsx": "export const Route = {};",
    "src/routes/index.tsx": "import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/')({component:()=> <main>Old</main>});",
  };
  const nodes: Record<string, unknown>[] = [];
  const folders = new Map<string, string>();
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/"); let parentId: string | null = null;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts.slice(0, i + 1).join("/");
      if (!folders.has(key)) {
        const id = `folder:${key}`; folders.set(key, id);
        nodes.push({id, kind:"folder", name:parts[i], parentId, createdAt:1, updatedAt:1});
      }
      parentId = folders.get(key)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:parts.at(-1),parentId,content,createdAt:1,updatedAt:1});
  }
  const activeFileId = "file:src/routes/index.tsx";
  return {version:2,language:"web",nodes,activeFileId,entryFileId:activeFileId,
    openTabs:[activeFileId],expanded:["folder:src"],stdin:"",leftPct:25} as unknown as WorkspaceStateV2;
}
const updated = "import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/')({component:()=> <main>New</main>});";
const original = "import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/')({component:()=> <main>Old</main>});";
const edits = [{path:"src/routes/index.tsx",beforeSha256:sha256(original),content:updated}];
const specification = {} as Params["specification"];
const input = (): Omit<Params, "dependencies"> => ({userId:"merchant-a",buildProjectId:"project-a",
  workspace:workspace(),edits,specification,sourceVersion:7,verificationId:"v-1"});

function trustedExecution(request: {buildProjectId:string;sourceVersion:number}) {
  const files = [
    {path:"client/assets/main.js",data:"console.log('client')"},
    {path:"server/index.js",data:"export default { fetch() {} }"},
    {path:"server/wrangler.json",data:'{"name":"site"}'},
  ];
  const hash = createHash("sha256"); let totalBytes = 0;
  const encoded = files.map(({path,data}) => {
    const bytes=Buffer.from(data,"utf8"); totalBytes+=bytes.length;
    hash.update(path).update("\0").update(bytes).update("\0");
    return {path,encoding:"base64",data:bytes.toString("base64")};
  });
  return {ok:true,result:{protocolVersion:1,operation:"production-build",
    buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,
    artifact:{type:"worker-bundle",serverOutputPath:"dist/server",assetsOutputPath:"dist/client",
      entrypoint:"index.js",sha256:hash.digest("hex"),totalBytes,files:encoded}}};
}
function dependencies(opts: {error?: Error; reply?: unknown; limited?: boolean; unavailable?: boolean} = {}) {
  let submitted: {buildProjectId:string;sourceVersion:number}|null = null;
  const prepare = vi.fn(({workspace: edited, buildProjectId, sourceVersion}: {workspace: WorkspaceStateV2;buildProjectId:string;sourceVersion:number}) => {
    const files = edited.nodes.filter(n=>n.kind==="file").map(n=>({path:n.name,content:n.content}));
    expect(files.some(file=>file.content===updated)).toBe(true);
    expect(files.some(file=>file.content===original)).toBe(false);
    submitted = {buildProjectId,sourceVersion};
    return {protocolVersion:1,operation:"production-build",stackId:"tanstack-start-v1",
      templateId:"tanstack-start-v1",buildProjectId,sourceVersion,
      files:[{path:"src/routes/index.tsx",content:updated}]};
  });
  const build = vi.fn(async ({request}: {request:{buildProjectId:string;sourceVersion:number}}) => {
    if (opts.error) throw opts.error;
    return opts.reply ?? trustedExecution(request);
  });
  const limit = vi.fn(async () => opts.unavailable ? null : {ok:opts.limited !== true});
  const actorKey = vi.fn(async () => "service-auth");
  const injected = {prepare,build,limit,actorKey} as unknown as Dependencies;
  return {injected, prepare,build,limit,actorKey, getSubmitted:()=>submitted};
}

describe("P3B7E4B2C exact candidate Worker verification",()=>{
  it("compiles only the in-memory approved changes and checks the authentic Worker receipt",async()=>{
    const deps=dependencies();const source=input();
    const before=source.workspace.nodes.find(n=>n.kind==="file" && n.name==="index.tsx") as {content:string};
    const value=await verifyTanstackWorkerEditCandidate({...source,dependencies:deps.injected});
    expect(value).toMatchObject({state:"passed",reason:"runner-passed",sourceVersion:7,
      verificationId:"v-1",artifactSha256:expect.stringMatching(/^[0-9a-f]{64}$/),browser:"not-run"});
    expect(deps.getSubmitted()).toEqual({buildProjectId:"project-a",sourceVersion:7});
    expect(deps.actorKey).toHaveBeenCalledWith("merchant-a");
    expect(deps.build).toHaveBeenCalledTimes(1);
    expect(before.content).toBe(original); // Never mutated persisted workspace.
  });
  it("fails closed on another project/source and on digest tampering",async()=>{
    for (const reply of [
      {ok:true,result:{...trustedExecution({buildProjectId:"other",sourceVersion:7}).result}},
      trustedExecution({buildProjectId:"project-a",sourceVersion:6}),
      {ok:true,result:{...trustedExecution({buildProjectId:"project-a",sourceVersion:7}).result,
        artifact:{...trustedExecution({buildProjectId:"project-a",sourceVersion:7}).result.artifact,sha256:"0".repeat(64)}}},
    ]) {
      const deps=dependencies({reply});
      const value=await verifyTanstackWorkerEditCandidate({...input(),dependencies:deps.injected});
      expect(value).toMatchObject({state:"not-run",reason:"runner-response-mismatch",artifactSha256:null});
    }
  });
  it("never calls the Runner on local capacity limits or missing admission authority",async()=>{
    for (const opts of [{limited:true},{unavailable:true}]) {
      const deps=dependencies(opts);
      const receipt=await verifyTanstackWorkerEditCandidate({...input(),dependencies:deps.injected});
      expect(receipt.state).toBe("not-run");
      expect(deps.build).not.toHaveBeenCalled();
      expect(deps.actorKey).not.toHaveBeenCalled();
    }
  });
  it("reports compile rejection without treating it as verified source",async()=>{
    const deps=dependencies({error:new RunnerHttpError(422,"private compiler output must not leak")});
    const receipt=await verifyTanstackWorkerEditCandidate({...input(),dependencies:deps.injected});
    expect(receipt).toMatchObject({state:"failed",reason:"runner-build-rejected",artifactSha256:null});
    expect(JSON.stringify(receipt)).not.toContain("private compiler output");
  });
  it("classifies missing Runner, service auth, and outages without a passed flag",async()=>{
    for (const [status,reason] of [[404,"runner-not-found"],[401,"runner-unauthorized"],[429,"capacity"],[503,"capacity"],[504,"runner-timeout"]] as const) {
      const deps=dependencies({error:new RunnerHttpError(status,"secret response")});
      const receipt=await verifyTanstackWorkerEditCandidate({...input(),dependencies:deps.injected});
      expect(receipt).toMatchObject({state:"not-run",reason});
    }
  });
  it("rejects stale edit hashes before calling the Runner or local capacity",async()=>{
    const deps=dependencies();
    await expect(verifyTanstackWorkerEditCandidate({...input(),edits:[{...edits[0],beforeSha256:"0".repeat(64)}],
      dependencies:deps.injected})).rejects.toThrow();
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.limit).not.toHaveBeenCalled();
  });
  it("does not use client-reported success or persist a new project version",()=>{
    const deps=dependencies();
    const result=prepareTanstackWorkerEditCandidate(input(),deps.injected.prepare);
    expect(result.request.sourceVersion).toBe(7);
    expect(result.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect("sourceVersionAfterSave" in result).toBe(false);
  });
});
