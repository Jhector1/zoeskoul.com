import {describe,expect,it,vi} from "vitest";
import { randomUUID } from "node:crypto";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { readOwnedTanstackDevelopmentPreview, redactDevelopmentPreviewBasePath, DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER } from "./tanstackDevelopmentPreviewRead.js";
import type { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";

const owner="u:"+"a".repeat(64);
const other="u:"+"b".repeat(64);
const project="project_test";
const previewId="preview_"+randomUUID();
const basePath=`/api/build/projects/${project}/preview/${previewId}/content/${"C".repeat(32)}/`;
function fixture(mode:"development"|"immutable"="development") {
 const registry=new SharedFullStackPreviewRegistry();
 let sourceVersion=7;
 const state={ get sourceVersion(){return sourceVersion;},update(v:number){sourceVersion=v;} };
 const identity={fingerprint:"f".repeat(64),sourceFingerprint:"a".repeat(64),dependencyFingerprint:"b".repeat(64),runtimeImageId:"sha256:"+"c".repeat(64)} as any;
 const lease=()=>({id:previewId,mode,ownerKey:owner,buildProjectId:project,
  sourceVersion:state.sourceVersion, identity,containerId:"test-container",
  basePath,createdAt:Date.now(),lastActivityAt:Date.now(),close:async()=>{}});
 registry.register(lease());
 const transport=vi.fn(async(_containerId:string,_request:unknown)=>({status:200,headers:{"content-type":"text/html"},
   bodyBase64:Buffer.from("<html></html>").toString("base64"),timing:{dockerExecMs:1,viteUpstreamMs:1}}));
 const args={ownerKey:owner,previewId,buildProjectId:project,sourceVersion:7,
   path:"index.html",method:"GET" as const,accept:"*/*" as const};
 const read=()=>readOwnedTanstackDevelopmentPreview(args,{registry,transport:transport as unknown as typeof fetchTanstackHttpInsideSandbox});
 return {registry,state,identity,lease,transport,args,read};
}
describe("Phase 4E2 private development-read fence",()=>{
 it("redacts the private Vite capability inside HTML and JS without modifying binary",()=>{
  const html=`<script src="${basePath}@vite/client"></script>`;
  const response={status:200,headers:{"content-type":"text/html"},bodyBase64:Buffer.from(html).toString("base64")};
  const output=redactDevelopmentPreviewBasePath(response,basePath);
  expect(Buffer.from(output.bodyBase64,"base64").toString()).toBe(`<script src="${DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER}@vite/client"></script>`);
  expect(output.bodyBase64).not.toContain("C".repeat(32));
  const binary={...response,headers:{"content-type":"image/png"}};
  expect(redactDevelopmentPreviewBasePath(binary,basePath)).toBe(binary);
 });
 it("reads only exact owner, project and current revision through the bounded transport",async()=>{
  const f=fixture();
  expect((await f.read()).sourceVersion).toBe(7);
  expect(f.transport).toHaveBeenCalledOnce();
  expect(f.transport.mock.calls[0][0]).toBe("test-container");
  const parsed=f.transport.mock.calls[0][1] as {method:string;path:string};
  expect(parsed.method).toBe("GET");
  expect(parsed.path).toBe(basePath+f.args.path);
 });
 it("refuses immutable leases, foreign owners and projects, stale versions and invalid paths",async()=>{
  const imm=fixture("immutable");
  await expect(imm.read()).rejects.toThrow("Preview not found.");
  const f=fixture();
  for (const input of [
   {...f.args,ownerKey:other},{...f.args,buildProjectId:"other"},
   {...f.args,sourceVersion:6},{...f.args,path:"http://evil.example/x"},
   {...f.args,path:basePath+"index.html"},{...f.args,path:"../escape"},
   {...f.args,path:"%252e%252e/escape"},{...f.args,path:"@fs/etc/passwd"},
   {...f.args,path:"x/%2F/secret"},{...f.args,path:"x//double"},
  ]) await expect(readOwnedTanstackDevelopmentPreview(input,{registry:f.registry,
   transport:f.transport as unknown as typeof fetchTanstackHttpInsideSandbox})).rejects.toThrow();
  expect(f.transport).not.toHaveBeenCalled();
 });
 it("allows a root document path and binds it to the private lease base",async()=>{
  const f=fixture();
  const answer=await readOwnedTanstackDevelopmentPreview({...f.args,path:""},{
    registry:f.registry,transport:f.transport as unknown as typeof fetchTanstackHttpInsideSandbox,
  });
  expect(answer.sourceVersion).toBe(7);
  expect((f.transport.mock.calls[0][1] as {path:string}).path).toBe(basePath);
 });
 it("preserves Vite virtual module ids and CSS URL queries without allowing general colon paths",async()=>{
  const f=fixture();
  await readOwnedTanstackDevelopmentPreview({...f.args,
    path:"@id/virtual:tanstack-start-dev-client-entry"},{registry:f.registry,
    transport:f.transport as unknown as typeof fetchTanstackHttpInsideSandbox});
  expect((f.transport.mock.calls[0][1] as {path:string}).path)
    .toBe(basePath+"@id/virtual:tanstack-start-dev-client-entry");
  await readOwnedTanstackDevelopmentPreview({...f.args,path:"src/styles.css?url"},{
    registry:f.registry,transport:f.transport as unknown as typeof fetchTanstackHttpInsideSandbox});
  expect((f.transport.mock.calls[1][1] as {path:string}).path)
    .toBe(basePath+"src/styles.css?url");
  await expect(readOwnedTanstackDevelopmentPreview({...f.args,path:"src/http:evil"},{
    registry:f.registry,transport:f.transport as unknown as typeof fetchTanstackHttpInsideSandbox}))
    .rejects.toThrow("Invalid development preview relative path.");
  await expect(readOwnedTanstackDevelopmentPreview({...f.args,
    path:"@id/virtual:unrelated-plugin"},{registry:f.registry,
    transport:f.transport as unknown as typeof fetchTanstackHttpInsideSandbox}))
    .rejects.toThrow("Invalid development preview relative path.");
 });
 it("never returns a response if a revision is committed during the read",async()=>{
  const f=fixture();
  let checks=0;
  const registry={
    assertDevelopmentReadOpen: (identity: Parameters<typeof f.registry.assertDevelopmentReadOpen>[0]) => {
      checks += 1;
      if(checks===2) throw new Error("Preview not found.");
      return f.registry.assertDevelopmentReadOpen(identity);
    },
    touch: (_id:string,_at:number)=>{throw new Error("A failed read may not update activity");},
  };
  const transport=vi.fn(async(_id:string,_request:unknown)=>({
    status:200,headers:{},bodyBase64:"",timing:{dockerExecMs:1,viteUpstreamMs:1},
  }));
  await expect(readOwnedTanstackDevelopmentPreview(f.args,{registry,
    transport:transport as unknown as typeof fetchTanstackHttpInsideSandbox})).rejects.toThrow("Preview not found.");
  expect(checks).toBe(2);
 });
 it("refuses reads while an update has a reserved slot",async()=>{
  const f=fixture();
  let release!:()=>void;
  const wait=new Promise<void>(r=>{release=r;});
  let signal!:()=>void;
  const entered=new Promise<void>(r=>{signal=r;});
  const update=f.registry.withDevelopmentUpdate(previewId,async()=>{signal();await wait;});
  await entered;
  await expect(f.read()).rejects.toThrow("Preview not found.");
  expect(f.transport).not.toHaveBeenCalled();
  release();await update;
 });
 it("refuses a lease once close has begun",async()=>{
  const f=fixture();
  const stopping=f.registry.close(previewId);
  await expect(f.read()).rejects.toThrow("Preview not found.");
  await stopping;
 });
 it("rejects a read when an update starts during the sandbox response",async()=>{
  const f=fixture();
  let release!:()=>void;
  const wait=new Promise<void>(r=>{release=r;});
  let update:Promise<void>|null=null;
  const transport=vi.fn(async(_id:string,_request:unknown)=>{
    update=f.registry.withDevelopmentUpdate(previewId,async()=>{await wait;});
    return {status:200,headers:{},bodyBase64:"",timing:{dockerExecMs:1,viteUpstreamMs:1}};
  });
  await expect(readOwnedTanstackDevelopmentPreview(f.args,{registry:f.registry,
    transport:transport as unknown as typeof fetchTanstackHttpInsideSandbox})).rejects.toThrow("Preview not found.");
  release();await update;
 });
});

describe("Phase 4F5H10K capability stem redaction",()=>{
 const stem=basePath.slice(0,-1);
 const marker=DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER.slice(0,-1);
 it("redacts a slashless router base alongside module imports",()=>{
  const original=`import "${basePath}src/routes/index.tsx"; const router = {basepath: ${JSON.stringify(stem)}};`;
  const response={status:200,headers:{"content-type":"text/javascript"},bodyBase64:Buffer.from(original).toString("base64")};
  const actual=Buffer.from(redactDevelopmentPreviewBasePath(response,basePath).bodyBase64,"base64").toString();
  expect(actual).toBe(`import "${marker}/src/routes/index.tsx"; const router = {basepath: ${JSON.stringify(marker)}};`);
  expect(actual).not.toContain(stem);
  expect(actual).not.toContain("C".repeat(32));
 });
 it("preserves slashes, query, fragment and punctuation in HTML, CSS and JSON",()=>{
  const suffixes=["", "/", "/about", "?x=1", "#section", "/src/styles.css?url"];
  for(const type of ["text/html", "text/css", "application/json"]){
   const original=JSON.stringify(suffixes.map(s=>stem+s));
   const response={status:200,headers:{"content-type":type},bodyBase64:Buffer.from(original).toString("base64")};
   const actual=Buffer.from(redactDevelopmentPreviewBasePath(response,basePath).bodyBase64,"base64").toString();
   expect(actual).toBe(JSON.stringify(suffixes.map(s=>marker+s)));
  }
 });
 it("does not alter unrelated paths or binary responses",()=>{
  const text=JSON.stringify([stem.replace("C".repeat(32),"D".repeat(32)),"/about"]);
  const response={status:200,headers:{"content-type":"text/javascript"},bodyBase64:Buffer.from(text).toString("base64")};
  expect(redactDevelopmentPreviewBasePath(response,basePath)).toBe(response);
  const binary={...response,headers:{"content-type":"image/png"},bodyBase64:Buffer.from(stem).toString("base64")};
  expect(redactDevelopmentPreviewBasePath(binary,basePath)).toBe(binary);
 });
});
