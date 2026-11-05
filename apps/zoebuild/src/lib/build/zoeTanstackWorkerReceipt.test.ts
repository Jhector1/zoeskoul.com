import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { verifyTanstackWorkerBuildReceipt } from "./zoeTanstackWorkerReceipt";

const request: ProductionBuildJobRequestV1 = {
  protocolVersion: 1, operation: "production-build", buildProjectId: "owner-project-a",
  sourceVersion: 12, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1", files: [],
};
const outputs = [
  {path:"client/assets/site.js",data:"console.log('site')"},
  {path:"server/index.js",data:"export default { fetch() {} }"},
  {path:"server/wrangler.json",data:'{"name":"worker"}'},
];
function response(source = outputs) {
  const sorted = [...source].sort((a,b)=>a.path.localeCompare(b.path,"en"));
  const digest = createHash("sha256");
  let totalBytes = 0;
  const files = sorted.map(({path,data})=>{
    const bytes=Buffer.from(data,"utf8");totalBytes+=bytes.length;
    digest.update(path).update("\0").update(bytes).update("\0");
    return {path,encoding:"base64" as const,data:bytes.toString("base64")};
  });
  return {ok:true,result:{protocolVersion:1,operation:"production-build",
    buildProjectId:request.buildProjectId,sourceVersion:request.sourceVersion,artifact:{
      type:"worker-bundle",serverOutputPath:"dist/server",assetsOutputPath:"dist/client",
      entrypoint:"index.js",totalBytes,sha256:digest.digest("hex"),files,
    }}};
}
const validate = (execution:unknown, req=request) => verifyTanstackWorkerBuildReceipt({request:req,execution});

describe("TanStack Worker trusted receipt verification (stage only)",()=>{
  it("checks server and client bytes and returns only an immutable verification receipt",()=>{
    const receipt=validate(response());
    expect(receipt).toEqual({state:"passed",buildProjectId:"owner-project-a",
      sourceVersion:12,artifactSha256:expect.stringMatching(/^[0-9a-f]{64}$/),
      artifactFiles:3,artifactBytes:expect.any(Number)});
    expect("files" in receipt).toBe(false);
  });
  it("rejects another project, source head, stack, and wrong operation",()=>{
    const original=response();
    expect(()=>validate({...original,result:{...original.result,buildProjectId:"other"}})).toThrow();
    expect(()=>validate({...original,result:{...original.result,sourceVersion:11}})).toThrow();
    expect(()=>validate({...original,result:{...original.result,operation:"preview-start"}})).toThrow();
    expect(()=>validate(original,{...request,stackId:"react-vite-v1"})).toThrow();
  });
  it("never accepts a static artifact or a browser-style passed claim",()=>{
    const original=response();
    expect(()=>validate({ok:true,state:"passed"})).toThrow();
    expect(()=>validate({...original,result:{...original.result,artifact:{...original.result.artifact,type:"static-directory"}}})).toThrow();
    expect(()=>validate({...original,result:{...original.result,artifact:{...original.result.artifact,serverOutputPath:"dist"}}})).toThrow();
  });
  it("detects modified bytes, digest fraud, duplicate paths, and bad base64",()=>{
    const original=response();
    const files=original.result.artifact.files;
    for (const broken of [
      files.map((f,i)=>i===0?{...f,data:Buffer.from("tampered").toString("base64")}:f),
      [...files,files[0]!],
      files.map((f,i)=>i===0?{...f,data:"!!!"}:f),
    ]) {
      expect(()=>validate({...original,result:{...original.result,artifact:{...original.result.artifact,files:broken}}})).toThrow();
    }
    expect(()=>validate({...original,result:{...original.result,artifact:{...original.result.artifact,totalBytes:1}}})).toThrow();
  });
  it("rejects secret paths, traversal, missing entry, missing Wrangler, and missing client assets",()=>{
    for (const name of ["server/.env", "client/../secrets.txt", "server/secret\\name"]) {
      expect(()=>validate(response([...outputs,{path:name,data:"secret"}]))).toThrow();
    }
    for (const path of ["server/index.js","server/wrangler.json","client/assets/site.js"]) {
      expect(()=>validate(response(outputs.filter(f=>f.path!==path)))).toThrow();
    }
    expect(()=>validate(response([...outputs,{path:"server/wrangler.json",data:"{}"}]))).toThrow();
  });
  it("rejects invalid Wrangler metadata and unsigned shape changes",()=>{
    expect(()=>validate(response(outputs.map(f=>f.path==="server/wrangler.json"?{...f,data:"not-json"}:f)))).toThrow();
    const original=response();
    expect(()=>validate({...original,ok:false})).toThrow();
  });
});
