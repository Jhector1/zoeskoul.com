import {describe,expect,it} from "vitest";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {runZoeProjectAgent,ZOE_PROJECT_AGENT_MAX_STEPS,ZoeProjectAgentError} from "./zoeProjectAgentLoop";

function workspace(files:Record<string,string>):WorkspaceStateV2 {
  const nodes: Array<Record<string,unknown>>=[];
  const dirs=new Map<string,string>();
  for(const [path,content] of Object.entries(files)) {
    let parentId:string|null=null;
    const parts=path.split("/");
    for(let i=0;i<parts.length-1;i++) {
      const name=parts.slice(0,i+1).join("/");
      if(!dirs.has(name)) {
        const id=`dir:${name}`;
        nodes.push({id,kind:"folder",name:parts[i],parentId,createdAt:1,updatedAt:1});
        dirs.set(name,id);
      }
      parentId=dirs.get(name)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:parts.at(-1),parentId,
      content,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes,openTabs:[],activeFileId:null,
    entryFileId:null,stdin:"",expanded:[],leftPct:25} as unknown as WorkspaceStateV2;
}
function action(kind:string,extra:Record<string,unknown>={}) {
  return JSON.stringify({kind,path:"",query:"",prefix:"",offset:0,limit:24000,
    summary:"",edits:[],patches:[],reads:[],...extra});
}
const project={title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null};

describe("V12K11F project-wide pre-inspection efficiency",()=>{
  it("prefetches complete authorized React sources and permits safe patch without model read turn",async()=>{
    const files={"src/App.tsx":"<header>One</header><main>Home</main>",
      "src/pages/contact.tsx":"<header>Two</header><main>Contact</main>"};
    const prompts:any[]=[];
    const out=await runZoeProjectAgent({workspace:workspace(files),userRequest:"Share header",
      conversation:[],system:"Preserve routes",project,maxSteps:12,
      generate:async req=>{
        prompts.push(JSON.parse(req.user));
        return {text:prompts.length===1 ? action("patch",{patches:[
          {path:"src/App.tsx",before:"<header>One</header>",after:"<SharedHeader/>"},
          {path:"src/pages/contact.tsx",before:"<header>Two</header>",after:"<SharedHeader/>"},
        ]}) : action("propose",{summary:"Prepared common header"})};
      }});
    expect(prompts[0].prefetchedSources.map((s:{path:string})=>s.path).sort())
      .toEqual(Object.keys(files).sort());
    expect(prompts[1].prefetchedSources).toEqual([]);
    expect(JSON.parse(out.text).edits).toHaveLength(2);
    expect(out.steps).toBe(2);
    expect(out.fullyReadPaths).toHaveLength(2);
  });
  it("does not falsely mark oversized files inspected or bypass protected source",async()=>{
    const prompts:any[]=[];
    const files={"src/App.tsx":"A".repeat(25_000),"src/page.tsx":"small", ".env.local":"topsecret"};
    const out=await runZoeProjectAgent({workspace:workspace(files),userRequest:"Inspect",
      conversation:[],system:"",project,maxSteps:12,
      generate:async req=>{prompts.push(JSON.parse(req.user));return {text:action("propose")};}});
    expect(prompts[0].prefetchedSources.map((s:{path:string})=>s.path)).toEqual(["src/page.tsx"]);
    expect(out.fullyReadPaths).toEqual(["src/page.tsx"]);
    expect(JSON.parse(out.text).edits).toEqual([]);
  });
  it("retains finite paid model-call cap and refuses incomplete editing without save",async()=>{
    expect(ZOE_PROJECT_AGENT_MAX_STEPS).toBe(12);
    let calls=0;
    await expect(runZoeProjectAgent({workspace:workspace({"src/App.tsx":"hello"}),
      userRequest:"Edit",conversation:[],system:"",project,maxSteps:2,
      generate:async()=>{calls++;return {text:action("list",{offset:0,limit:100})};}}))
      .rejects.toMatchObject({name:"ZoeProjectAgentError",code:"AGENT_INSPECTION_INCOMPLETE"});
    expect(calls).toBe(2);
  });
});
