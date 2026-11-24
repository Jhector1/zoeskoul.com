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


describe("U17 server-side saved image evidence", () => {
  const bytes = Buffer.from("pilot-image");
  const asset = {path:"pilot.png",encoding:"base64" as const,mimeType:"image/png" as const,
    sizeBytes:bytes.length,data:bytes.toString("base64"),checksum:`sha256:${createHash("sha256").update(bytes).digest("hex")}`};
  const req = {...request,binaryFiles:[asset]};
  it("recognizes exact emitted bytes or a complete inline data URI", () => {
    const file = verifyTanstackWorkerBuildReceipt({request:req,inspectBinaryAssets:true,
      execution:response([...outputs,{path:"client/assets/pilot.png",data:"pilot-image"}])});
    expect(file.binaryAssets).toEqual([{path:asset.path,sha256:asset.checksum.slice(7),byteLength:bytes.length,
      clientFileMatch:true,clientInlineMatch:false}]);
    const inline = verifyTanstackWorkerBuildReceipt({request:req,inspectBinaryAssets:true,
      execution:response([...outputs,{path:"client/assets/image.js",data:`const img="data:image/png;base64,${asset.data}";`}])});
    expect(inline.binaryAssets?.[0]).toMatchObject({clientFileMatch:false,clientInlineMatch:true});
    expect(JSON.stringify(inline)).not.toContain(asset.data);
  });
  it("reports absent or wrong output bytes without claiming asset integrity", () => {
    const value = verifyTanstackWorkerBuildReceipt({request:req,inspectBinaryAssets:true,execution:response(outputs)});
    expect(value.binaryAssets?.[0]).toMatchObject({clientFileMatch:false,clientInlineMatch:false});
    expect(()=>verifyTanstackWorkerBuildReceipt({request:{...req,binaryFiles:[{...asset,checksum:`sha256:${"0".repeat(64)}`}]},
      inspectBinaryAssets:true,execution:response(outputs)})).toThrow();
  });
});


describe("U17C receipt rejection stages", () => {
  it("identifies response envelope, binding, order and content errors without accepting them", () => {
    const original = response();
    const artifact = original.result.artifact;
    const cases: Array<[unknown, string]> = [
      [{ok:false}, "envelope-ok"],
      [{ok:true}, "result-object"],
      [{...original,result:{...original.result,sourceVersion:11}}, "revision-binding"],
      [{...original,result:{...original.result,artifact:{...artifact,files:[...artifact.files].reverse()}}}, "file-order"],
      [{...original,result:{...original.result,artifact:{...artifact,totalBytes:artifact.totalBytes+1}}}, "total-bytes"],
      [{...original,result:{...original.result,artifact:{...artifact,sha256:"0".repeat(64)}}}, "artifact-digest"],
    ];
    for (const [value,stage] of cases) {
      let caught: unknown;
      try { validate(value); } catch (error) { caught = error; }
      expect(caught).toMatchObject({name:"TanstackWorkerReceiptError",stage});
    }
  });
});


describe("U17D canonical binary checksum contract", () => {
  it("rejects wrong format, changed bytes, size and noncanonical base64", () => {
    const data = Buffer.from("abc").toString("base64");
    const checksum = `sha256:${createHash("sha256").update("abc").digest("hex")}`;
    const asset = {path:"pilot.png",encoding:"base64" as const,mimeType:"image/png" as const,
      sizeBytes:3,data,checksum};
    for (const invalid of [
      {...asset,checksum:checksum.slice(7)},
      {...asset,checksum:checksum.toUpperCase()},
      {...asset,checksum:`sha256:${"0".repeat(64)}`},
      {...asset,data:Buffer.from("abd").toString("base64")},
      {...asset,sizeBytes:4},
      {...asset,data:data+"\n"},
    ]) {
      expect(()=>verifyTanstackWorkerBuildReceipt({request:{...request,binaryFiles:[invalid]},
        inspectBinaryAssets:true,execution:response(outputs)})).toThrow();
    }
  });
});


describe("U18 independent runtime evidence",()=>{
  it("accepts digest-bound HTTP smoke without implying browser execution",()=>{
    const original=response();
    const smoke={state:"passed",artifactSha256:original.result.artifact.sha256,homeStatus:200,healthStatus:200,verifiedClientAssets:2};
    expect(validate({...original,result:{...original.result,runtimeSmoke:smoke}}).runtimeSmoke).toEqual(smoke);
    expect(validate(original).runtimeSmoke).toBeUndefined();
    expect(()=>validate({...original,result:{...original.result,runtimeSmoke:{...smoke,artifactSha256:"0".repeat(64)}}})).toThrow();
    expect(()=>validate({...original,result:{...original.result,runtimeSmoke:{...smoke,browser:"passed"}}})).toThrow();
    expect(()=>validate({...original,result:{...original.result,runtimeSmoke:{...smoke,verifiedClientAssets:0}}})).toThrow();
  });
  it("preserves explicit runtime failure separately from compilation",()=>{
    const original=response();
    const smoke={state:"failed",artifactSha256:original.result.artifact.sha256,stage:"health"};
    expect(validate({...original,result:{...original.result,runtimeSmoke:smoke}})).toMatchObject({state:"passed",runtimeSmoke:smoke});
  });
});


describe("U20 saved-source receipt",()=>{
  it("requires exact source fingerprint and independent runtime evidence when enabled",()=>{
    const original=response();
    const snapshotSha256=createHash("sha256").update(JSON.stringify({files:request.files,binaryFiles:[]})).digest("hex");
    const runtimeSmoke={state:"failed",artifactSha256:original.result.artifact.sha256,stage:"health"};
    const verify=(result:unknown)=>verifyTanstackWorkerBuildReceipt({request,execution:{ok:true,result},requireRuntimeReceipt:true});
    expect(()=>verify(original.result)).toThrow();
    expect(()=>verify({...original.result,snapshotSha256})).toThrow();
    expect(()=>verify({...original.result,snapshotSha256:"0".repeat(64),runtimeSmoke})).toThrow();
    expect(verify({...original.result,snapshotSha256,runtimeSmoke})).toMatchObject({state:"passed",runtimeSmoke});
  });
  it("reports multiple emitted, inlined and unused assets without returning their bytes",()=>{
    const assets=["emitted","inline","unused"].map(text=>({path:text+".png",encoding:"base64" as const,mimeType:"image/png" as const,data:Buffer.from(text).toString("base64"),sizeBytes:Buffer.byteLength(text),checksum:"sha256:"+createHash("sha256").update(text).digest("hex")}));
    const evidence=verifyTanstackWorkerBuildReceipt({request:{...request,binaryFiles:assets},inspectBinaryAssets:true,execution:response([...outputs,{path:"client/assets/a.png",data:"emitted"},{path:"client/assets/a.js",data:`data:image/png;base64,${assets[1]!.data}`}])});
    expect(evidence.binaryAssets?.map(a=>[a.clientFileMatch,a.clientInlineMatch])).toEqual([[true,false],[false,true],[false,false]]);
    expect(()=>verifyTanstackWorkerBuildReceipt({request:{...request,binaryFiles:[assets[0]!,assets[0]!] },inspectBinaryAssets:true,execution:response()})).toThrow();
  });
});
