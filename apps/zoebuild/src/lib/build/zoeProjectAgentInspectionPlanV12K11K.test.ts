import {describe,expect,it} from "vitest";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {runZoeProjectAgent, ZOE_PROJECT_AGENT_MAX_STEPS} from "./zoeProjectAgentLoop";

function workspace(files:Record<string,string>):WorkspaceStateV2 {
  const nodes:Array<Record<string,unknown>> = [];
  const directories = new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const segments=path.split("/");
    let parentId:string|null=null;
    for (let i=0;i<segments.length-1;i++) {
      const directory=segments.slice(0,i+1).join("/");
      if (!directories.has(directory)) {
        const id=`directory:${directory}`;
        nodes.push({id,kind:"folder",name:segments[i],parentId,createdAt:1,updatedAt:1});
        directories.set(directory,id);
      }
      parentId=directories.get(directory)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:segments.at(-1),parentId,
      content,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes,openTabs:[],activeFileId:null,
    entryFileId:null,stdin:"",expanded:[],leftPct:25} as unknown as WorkspaceStateV2;
}
const project={title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null};
function action(kind:string,extra:Record<string,unknown>={}) {
  return JSON.stringify({kind,path:"",query:"",prefix:"",offset:0,limit:24000,
    summary:"",edits:[],patches:[],reads:[],...extra});
}

describe("V12K11K coordinated project inspection",()=>{
  it("inspects the full authorized React source prefix in one inspection action and stages a coherent proposal",async()=>{
    const files={
      "src/main.tsx":"import App from './App';",
      "src/App.tsx":"<header>Home</header>",
      "src/pages/studio.tsx":"<header>Studio</header>",
      "src/pages/contact.tsx":"<header>Contact</header>",
      "src/ZoePages.tsx":"export const pages = [];",
    };
    const prompts:Array<any>=[];
    const out=await runZoeProjectAgent({workspace:workspace(files),userRequest:"Share the common header",
      conversation:[],system:"Preserve page routing",project,maxSteps:4,
      generate:async(req)=>{
        prompts.push(JSON.parse(req.user));
        if (prompts.length===1) return {text:action("inspect",{prefix:"src/"})};
        if (prompts.length===2) return {text:action("patch",{patches:[
          {path:"src/App.tsx",before:"<header>Home</header>",after:"<SiteHeader/>"},
          {path:"src/pages/studio.tsx",before:"<header>Studio</header>",after:"<SiteHeader/>"},
          {path:"src/pages/contact.tsx",before:"<header>Contact</header>",after:"<SiteHeader/>"},
        ]})};
        return {text:action("propose",{summary:"Shared header prepared"})};
      }});
    const inspection=prompts[1].observations.find((x:{action:string})=>x.action==="inspect").response;
    expect(inspection.complete).toBe(true);
    expect(inspection.reads.map((x:{path:string})=>x.path).sort()).toEqual(Object.keys(files).sort());
    expect(inspection.reads.every((x:{nextOffset:number|null})=>x.nextOffset===null)).toBe(true);
    expect(out.steps).toBe(3);
    expect([...out.fullyReadPaths].sort()).toEqual(Object.keys(files).sort());
    expect(JSON.parse(out.text).edits).toHaveLength(3);
  });

  it("continues an oversized source from the exact authorized offset without marking it fully read early",async()=>{
    const text="x".repeat(88_000)+"FINAL_ANCHOR"; // above one observation allowance
    const prompts:Array<any>=[];
    const out=await runZoeProjectAgent({workspace:workspace({"src/large.tsx":text}),
      userRequest:"Change end",conversation:[],system:"",project,maxSteps:4,
      generate:async(req)=>{
        prompts.push(JSON.parse(req.user));
        if(prompts.length<=2) return {text:action("inspect",{path:"src/large.tsx"})};
        if(prompts.length===3) return {text:action("patch",{patches:[
          {path:"src/large.tsx",before:"FINAL_ANCHOR",after:"changed"},
        ]})};
        return {text:action("propose",{summary:"Completed the large source change"})};
      }});
    const first=prompts[1].observations.at(-1).response;
    expect(first.complete).toBe(false);
    expect(first.reads[0].nextOffset).toBe(80_000);
    const second=prompts[2].observations.at(-1).response;
    expect(second.complete).toBe(true);
    expect(second.reads[0].offset).toBe(80_000);
    expect(out.fullyReadPaths).toEqual(["src/large.tsx"]);
    expect(JSON.parse(out.text).edits[0].content).toContain("changed");
  });

  it("does not inspect .env or other protected paths from selected prefixes",async()=>{
    const prompts:Array<any>=[];
    const out=await runZoeProjectAgent({workspace:workspace({
      "src/App.tsx":"safe", ".env.local":"secret123", "src/private.key":"password"}),
      userRequest:"Inspect",conversation:[],system:"",project,maxSteps:2,
      generate:async(req)=>{
        prompts.push(JSON.parse(req.user));
        return {text:prompts.length===1 ? action("inspect",{prefix:"src/",reads:[
          {path:".env.local",offset:0,limit:24000}]}) : action("propose")};
      }});
    const result=prompts[1].observations[0].response;
    expect(result.reads.find((x:{path:string})=>x.path===".env.local")?.error).toBe("INVALID_PATH");
    expect(result.reads.some((x:{path:string})=>x.path==="src/private.key")).toBe(false);
    expect(out.fullyReadPaths).toEqual(["src/App.tsx"]);
  });

  it("fails closed if a staged patch targets an uninspected source",async()=>{
    let calls=0;
    await expect(runZoeProjectAgent({workspace:workspace({
      "src/App.tsx":"<h1>Home</h1>", "src/unused.tsx":"<h1>Unused</h1>"}),
      userRequest:"Change",conversation:[],system:"",project,maxSteps:2,
      generate:async()=>{calls++;return {text:action("patch",{patches:[
        {path:"src/unused.tsx",before:"Unused",after:"Changed"}]})};}}))
      .rejects.toMatchObject({code:"AGENT_INSPECTION_INCOMPLETE"});
    expect(calls).toBe(2);
  });

  it("keeps selected model call count bounded and never saves a partial draft",async()=>{
    expect(ZOE_PROJECT_AGENT_MAX_STEPS).toBe(12);
    let calls=0;
    await expect(runZoeProjectAgent({workspace:workspace({"src/App.tsx":"hello"}),
      userRequest:"Refactor",conversation:[],system:"",project,maxSteps:2,
      generate:async()=>{calls++;return {text:action("inspect",{prefix:"src/"})};}}))
      .rejects.toMatchObject({code:"AGENT_INSPECTION_INCOMPLETE"});
    expect(calls).toBe(2);
  });
});
