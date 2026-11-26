import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { ProductionBuildJobRequestV1, TanstackWorkerArtifactV1 } from "@zoeskoul/build-executor-contracts";
import { isObservedU18GeneratedConfig, isDiscardableU18GeneratedMetadata, shouldRunWorkerSmoke, workerSmokeConfig, workerSmokeCommand, selectWorkerSmokeAssets } from "./tanstackWorkerRuntimePolicy.js";
const req:ProductionBuildJobRequestV1={protocolVersion:1,operation:"production-build",buildProjectId:"cmwqiqnly0002eldlcafn1xjx",sourceVersion:7,stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",files:[]};
const config={main:"index.js",compatibility_date:"2026-10-01",compatibility_flags:["nodejs_compat"],assets:{directory:"../client"},no_bundle:true};
function artifact(meta:unknown):TanstackWorkerArtifactV1 {
  return {type:"worker-bundle",serverOutputPath:"dist/server",assetsOutputPath:"dist/client",entrypoint:"index.js",sha256:"a".repeat(64),totalBytes:1,
    files:[{path:"server/wrangler.json",encoding:"base64",data:Buffer.from(JSON.stringify(meta)).toString("base64")},
      {path:"client/assets/app.js",encoding:"base64",data:"YQ=="},{path:"client/assets/app.css",encoding:"base64",data:"Yg=="}]};
}
describe("U18 worker smoke policy",()=>{
  it("is opt-in, exact project and revision",()=>{
    expect(shouldRunWorkerSmoke(req,"")).toBe(false);
    const flag=req.buildProjectId+":7:"+createHash("sha256").update(JSON.stringify({files:req.files,binaryFiles:[]})).digest("hex");
    expect(shouldRunWorkerSmoke(req,flag)).toBe(true);
    expect(shouldRunWorkerSmoke({...req,sourceVersion:8},flag)).toBe(false);
    expect(shouldRunWorkerSmoke({...req,buildProjectId:"other"},flag)).toBe(false);
    expect(shouldRunWorkerSmoke({...req,files:[{path:"index.ts",content:"changed"}]},flag)).toBe(false);
  });
  it("reconstructs only fixed local configuration",()=>{
    expect(workerSmokeConfig(artifact(config))).toMatchObject({main:"/workspace/dist/server/index.js",assets:{directory:"/workspace/dist/client"},no_bundle:true});
    const command=workerSmokeCommand(artifact(config));
    expect(command.slice(0,2)).toEqual(["node","-e"]);
    expect(command[2]).toContain("--no-bundle");
    expect(command[2]).toContain("127.0.0.1");
  });
  it.each([{...config,main:"../../other.js"},{...config,assets:{directory:"/etc"}},{...config,services:[{binding:"REMOTE",service:"x"}]},{...config,vars:{SECRET:"x"}},{...config,kv_namespaces:[{binding:"KV",id:"x"}]},{...config,build:{command:"bad"}},{...config,compatibility_flags:["other"]},{...config,assets:{directory:"../client",binding:"ASSETS"}}])("rejects unsupported runtime metadata",meta=>expect(()=>workerSmokeConfig(artifact(meta))).toThrow());
  it("accepts normalized binding-free Vite metadata without forwarding any generated setting",()=>{
    const normalized={...config,jsx_factory:"React.createElement",jsx_fragment:"React.Fragment",
      durable_objects:{bindings:[]},queues:{producers:[],consumers:[]},logfwdr:{bindings:[]},
      python_modules:{exclude:[]},dev:{ip:"0.0.0.0",port:9999,local_protocol:"https",upstream_protocol:"https",enable_containers:true}};
    expect(workerSmokeConfig(artifact(normalized))).toEqual(workerSmokeConfig(artifact(config)));
    expect(workerSmokeCommand(artifact(normalized))).toEqual(workerSmokeCommand(artifact(config)));
  });
  it("accepts the default Python exclusion without enabling or forwarding Python settings",()=>{
    const normalized={...config,python_modules:{exclude:["**/*.pyc"]}};
    expect(workerSmokeConfig(artifact(normalized))).toEqual(workerSmokeConfig(artifact(config)));
    expect(workerSmokeCommand(artifact(normalized))).toEqual(workerSmokeCommand(artifact(config)));
  });
  it.each([
    {python_modules:{exclude:["**/*.pyc"],binding:"PYTHON"}},
    {python_modules:{exclude:["**/*.pyc","extra.py"]}},
    {python_modules:{exclude:"**/*.pyc"}},
    {durable_objects:{bindings:[{name:"DO",class_name:"Thing"}]}},
    {durable_objects:{bindings:[],unknown:[]}},
    {queues:{producers:[{binding:"Q",queue:"q"}],consumers:[]}},
    {queues:{producers:[],consumers:[{queue:"q"}]}},
    {queues:{producers:{},consumers:[]}},
    {logfwdr:{bindings:[{name:"logs",destination:"remote"}]}},
    {python_modules:{exclude:["something.py"]}},
    {python_modules:{unknown:[]}},
    {jsx_factory:"(() => malicious())"},
    {jsx_fragment:{value:"React.Fragment"}},
    {dev:{remote:{enabled:true}}},
    {dev:["not an object"]},
  ])("rejects nonempty binding groups or unsupported normalized metadata",meta=>{
    expect(()=>workerSmokeConfig(artifact({...config,...meta}))).toThrow(/Unsupported Worker smoke configuration/);
  });
  it("names a rejected known field without leaking values",()=>{
    expect(()=>workerSmokeConfig(artifact({...config,queues:{producers:[{binding:"PRIVATE_VALUE"}]}})))
      .toThrow("Unsupported Worker smoke configuration. Field: queues");
  });
  it("selects compiled assets actually referenced by SSR HTML",()=>{
    expect(selectWorkerSmokeAssets(artifact(config),'<script src="/assets/app.js"></script><link href="/assets/app.css">').map(f=>f.path)).toEqual(["client/assets/app.js","client/assets/app.css"]);
    expect(()=>selectWorkerSmokeAssets(artifact(config),'<script src="https://example.com/assets/app.js"></script>')).toThrow();
  });
});

describe("U18F5 observed generated metadata compatibility", () => {
  it.each([
    ["jsx_factory", "React.createElement"],
    ["jsx_fragment", "React.Fragment"],
    ["durable_objects", {bindings:[]}],
    ["queues", {producers:[],consumers:[]}],
    ["logfwdr", {bindings:[]}],
    ["python_modules", {exclude:[]}],
    ["dev", {a:1,b:2,c:3,d:4,e:5}],
  ])("discards only an observed pilot field: %s", (key, value) => {
    expect(isDiscardableU18GeneratedMetadata(key as string, value, true)).toBe(true);
    expect(isDiscardableU18GeneratedMetadata(key as string, value, false)).toBe(false);
    expect(workerSmokeConfig(artifact({...config,[key as string]:value}))).toEqual(workerSmokeConfig(artifact(config)));
  });
  it.each([
    ["durable_objects", {bindings:[{name:"DO",class_name:"Counter"}]}],
    ["durable_objects", {bindings:[],unexpected:[]}],
    ["queues", {producers:[{binding:"Q",queue:"q"}],consumers:[]}],
    ["queues", {producers:[],consumers:[{queue:"q"}]}],
    ["logfwdr", {bindings:[{name:"LOG",destination:"remote"}]}],
    ["logfwdr", {bindings:{}}],
    ["services", [{binding:"REMOTE"}]],
    ["vars", {SECRET:"x"}],
    ["jsx_factory", "customFactory"],
  ])("still rejects nonempty or unsupported metadata: %s", (key,value) => {
    expect(isDiscardableU18GeneratedMetadata(key as string,value,true)).toBe(false);
  });
  it("does not trust a reported artifact SHA without hashing the actual config bytes", () => {
    const sha="28bd98025eccd22a4126029fbcce7862e2885629a4a9e71b3efd8723ca40eeba";
    expect(isObservedU18GeneratedConfig(sha,Buffer.alloc(1298))).toBe(false);
    expect(isObservedU18GeneratedConfig("a".repeat(64),Buffer.alloc(1298))).toBe(false);
    expect(() => workerSmokeConfig({...artifact({...config,dev:{remote:{enabled:true}}}),sha256:sha})).toThrow();
  });
});


describe("U20 general runtime boundary",()=>{
  it("requires the explicit dedicated pool and rollout flag",async()=>{
    const {generalWorkerVerificationEnabled,workerVerificationSnapshot}=await import("./tanstackWorkerRuntimePolicy.js");
    expect(generalWorkerVerificationEnabled("1","zoebuild")).toBe(true);
    for(const flag of ["","true","0"]) expect(generalWorkerVerificationEnabled(flag,"zoebuild")).toBe(false);
    expect(generalWorkerVerificationEnabled("1","zoeskoul-learning")).toBe(false);
    expect(workerVerificationSnapshot(req)).not.toBe(workerVerificationSnapshot({...req,files:[{path:"x.ts",content:"x"}]}));
  });
  it("reconstructs configuration for non-pilot artifacts and rejects nonempty bindings",()=>{
    const meta={...config,jsx_factory:"React.createElement",durable_objects:{bindings:[]},python_modules:{exclude:[]},dev:{a:1,b:2,c:3,d:4,e:5}};
    expect(workerSmokeConfig(artifact(meta),false,true)).not.toHaveProperty("dev");
    expect(workerSmokeConfig(artifact(meta),false,true)).not.toHaveProperty("durable_objects");
    for(const bad of [{...meta,durable_objects:{bindings:[{name:"BAD"}]}},{...meta,python_modules:{exclude:["x"]}},{...meta,services:[{binding:"X"}]}])
      expect(()=>workerSmokeConfig(artifact(bad),false,true)).toThrow();
  });
});
