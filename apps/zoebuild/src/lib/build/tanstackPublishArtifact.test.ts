import {createHash} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import type {ProductionBuildJobRequestV1,TanstackWorkerBuildExecutionResponseV1} from "@zoeskoul/build-executor-contracts";
vi.mock("server-only",()=>({}));
import {stageTanstackPublishArtifact} from "./tanstackPublishArtifact";
const sha=(v:string|Uint8Array)=>createHash("sha256").update(v).digest("hex");
const request:ProductionBuildJobRequestV1={protocolVersion:1,operation:"production-build",buildProjectId:"project_test",sourceVersion:4,stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",files:[{path:"src/index.ts",content:"private-source"}]};
function fixture(){
 const rows=[{path:"client/a.js",text:"client"},{path:"server/index.js",text:"server"},{path:"server/wrangler.json",text:"{}"}];
 const hash=createHash("sha256");let totalBytes=0;
 const files=rows.map(({path,text})=>{const b=Buffer.from(text);totalBytes+=b.length;hash.update(path).update("\0").update(b).update("\0");return {path,encoding:"base64" as const,data:b.toString("base64")}});
 const execution:TanstackWorkerBuildExecutionResponseV1={ok:true,result:{protocolVersion:1,operation:"production-build",buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,snapshotSha256:sha(JSON.stringify({files:request.files,binaryFiles:[]})),artifact:{type:"worker-bundle",serverOutputPath:"dist/server",assetsOutputPath:"dist/client",entrypoint:"index.js",sha256:hash.digest("hex"),totalBytes,files}}};
 const objects=new Map<string,Uint8Array>();
 const store={putIfAbsent:vi.fn(async(i:{key:string;bytes:Uint8Array})=>{if(objects.has(i.key))return "already-exists" as const;objects.set(i.key,Uint8Array.from(i.bytes));return "created" as const}),read:vi.fn(async(k:string)=>objects.get(k)??null)};
 return {input:{ownerId:"owner_test",request,execution,store},objects,store,execution};
}
describe("private TanStack publish artifact handoff",()=>{
 it("stages exact compiled bytes and reuses the same immutable key",async()=>{const f=fixture();const a=await stageTanstackPublishArtifact(f.input);const b=await stageTanstackPublishArtifact(f.input);expect(a).toEqual(b);expect(a.objectKey).toBe(`published-artifacts/owner_test/project_test/4/${a.artifactSha256}/${a.objectSha256}`);expect(f.objects.size).toBe(1);expect(sha(f.objects.get(a.objectKey)!)).toBe(a.objectSha256);expect(Buffer.from(f.objects.get(a.objectKey)!).toString()).not.toContain("private-source");expect(a).not.toHaveProperty("publicUrl");});
 it("rejects wrong or absent snapshot before writing",async()=>{for(const snapshotSha256 of [undefined,"0".repeat(64)]){const f=fixture();await expect(stageTanstackPublishArtifact({...f.input,execution:{...f.execution,result:{...f.execution.result,snapshotSha256}}})).rejects.toThrow();expect(f.store.putIfAbsent).not.toHaveBeenCalled();}});
 it("rejects tampered artifact and invalid owner",async()=>{const f=fixture();await expect(stageTanstackPublishArtifact({...f.input,ownerId:"../owner"})).rejects.toThrow();await expect(stageTanstackPublishArtifact({...f.input,execution:{...f.execution,result:{...f.execution.result,artifact:{...f.execution.result.artifact,sha256:"0".repeat(64)}}}})).rejects.toThrow();expect(f.store.putIfAbsent).not.toHaveBeenCalled();});
 it("fails closed on missing or corrupt readback",async()=>{for(const bytes of [null,Uint8Array.from([1])]){const f=fixture();f.store.read.mockResolvedValue(bytes);await expect(stageTanstackPublishArtifact(f.input)).rejects.toThrow();}});
});
