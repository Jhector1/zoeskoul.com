import {describe, expect, it} from "vitest";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {runZoeProjectAgent, ZoeProjectAgentError} from "./zoeProjectAgentLoop";

function workspace(files: Record<string,string>): WorkspaceStateV2 {
  const nodes: Array<Record<string,unknown>> = [];
  const dirs = new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const parts = path.split("/");
    let parentId: string|null = null;
    for (let i=0;i<parts.length-1;i++) {
      const key=parts.slice(0,i+1).join("/");
      if (!dirs.has(key)) {
        const id=`d:${key}`;
        nodes.push({id,kind:"folder",name:parts[i],parentId,createdAt:1,updatedAt:1});
        dirs.set(key,id);
      }
      parentId=dirs.get(key)!;
    }
    nodes.push({id:`f:${path}`,kind:"file",name:parts.at(-1),parentId,
      content,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes,openTabs:[],activeFileId:null,
    entryFileId:null,stdin:"",expanded:[],leftPct:25} as unknown as WorkspaceStateV2;
}
const project={title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null};
function action(kind: string, options: Record<string,unknown> = {}) {
  return JSON.stringify({kind,path:"",query:"",prefix:"",offset:0,limit:24000,
    summary:"",edits:[],patches:[],reads:[],...options});
}

describe("V12K11L final coordinated proposal and safe exhaustion evidence",()=>{
  it("finishes an inspected multi-file patch on the second paid model turn", async()=>{
    const prompts: Array<Record<string,unknown>>=[];
    const source=workspace({"src/App.tsx":"<header>A</header>",
      "src/pages/studio.tsx":"<header>B</header>"});
    const result=await runZoeProjectAgent({workspace:source,userRequest:"Extract shared header",
      conversation:[],system:"",project,maxSteps:2,
      generate:async request=>{
        prompts.push(JSON.parse(request.user));
        return {text:prompts.length===1?action("inspect",{prefix:"src/"}):
          action("propose",{summary:"All headers replaced",patches:[
            {path:"src/App.tsx",before:"<header>A</header>",after:"<SharedHeader />"},
            {path:"src/pages/studio.tsx",before:"<header>B</header>",after:"<SharedHeader />"},
          ]})};
      }});
    expect(result.steps).toBe(2);
    expect((prompts[1]!.fullyReadPaths as string[]).sort()).toEqual(["src/App.tsx","src/pages/studio.tsx"]);
    expect(JSON.parse(result.text).edits).toHaveLength(2);
    expect(source.nodes.filter(n=>n.kind==="file").map(n=>n.content))
      .toEqual(["<header>A</header>","<header>B</header>"]);
  });

  it("can create a shared component and patch inspected pages in the same final action",async()=>{
    let calls=0;
    const output=await runZoeProjectAgent({workspace:workspace({"src/App.tsx":"<header>A</header>"}),
      userRequest:"Share header",conversation:[],system:"",project,maxSteps:2,
      generate:async()=>{calls++;
        return {text:calls===1?action("inspect",{prefix:"src/"}):action("propose",{
          edits:[{path:"src/components/SiteHeader.tsx",content:"export default function SiteHeader(){return null}",create:true}],
          patches:[{path:"src/App.tsx",before:"<header>A</header>",after:"<SiteHeader />"}],
        })};
      }});
    expect(output.steps).toBe(2);
    expect(JSON.parse(output.text).edits.map((e:{path:string})=>e.path).sort())
      .toEqual(["src/App.tsx","src/components/SiteHeader.tsx"]);
  });

  it("a rejected final patch restores earlier staged edits and never saves a partial candidate",async()=>{
    let calls=0;
    const output=await runZoeProjectAgent({workspace:workspace({"src/App.tsx":"A",
      "src/pages/studio.tsx":"B"}),userRequest:"Update",conversation:[],system:"",project,maxSteps:4,
      generate:async()=>{calls++;
        if(calls===1)return {text:action("inspect",{prefix:"src/"})};
        if(calls===2)return {text:action("stage",{edits:[
          {path:"src/App.tsx",content:"Already staged",create:false}]})};
        if(calls===3)return {text:action("propose",{edits:[
          {path:"src/App.tsx",content:"Rejected candidate",create:false}],patches:[
          {path:"src/pages/studio.tsx",before:"MISSING_ANCHOR",after:"new"}]})};
        return {text:action("propose",{summary:"Previous good staged change"})};
      }});
    expect(calls).toBe(4);
    expect(JSON.parse(output.text).edits).toEqual([
      {path:"src/App.tsx",content:"Already staged",create:false}]);
  });

  it("keeps no-partial-save and reports aggregate progress when all model steps are used",async()=>{
    let calls=0;
    let failure:unknown;
    try {
      await runZoeProjectAgent({workspace:workspace({"src/App.tsx":"safe"}),
        userRequest:"Inspect",conversation:[],system:"",project,maxSteps:2,
        generate:async()=>{calls++;return {text:action("inspect",{prefix:"src/"})};}});
    } catch(error) {failure=error;}
    expect(failure).toBeInstanceOf(ZoeProjectAgentError);
    const error=failure as ZoeProjectAgentError;
    expect(error.code).toBe("AGENT_INSPECTION_INCOMPLETE");
    expect(error.progress).toMatchObject({modelSteps:2,fullyReadFiles:1,stagedFiles:0,
      lastAction:"inspect",actionCounts:{inspect:2}});
    expect(calls).toBe(2);
    expect(JSON.stringify(error.progress)).not.toContain("safe");
  });

  it("rejects final patch to an uninspected protected file without a model retry",async()=>{
    let calls=0;
    await expect(runZoeProjectAgent({workspace:workspace({
      "src/App.tsx":"A", ".env.local":"SECRET_DO_NOT_READ"}),
      userRequest:"Edit",conversation:[],system:"",project,maxSteps:2,
      generate:async()=>{calls++;
        return {text:calls===1?action("inspect",{prefix:"src/"}):
          action("propose",{patches:[{path:".env.local",before:"SECRET_DO_NOT_READ",after:"bad"}]})};
      }})).rejects.toMatchObject({code:"AGENT_INSPECTION_INCOMPLETE"});
    expect(calls).toBe(2);
  });
});
