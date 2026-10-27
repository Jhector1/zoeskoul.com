import {describe, expect, it} from "vitest";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {runZoeProjectAgent, zoeProjectAgentResponseSchema, ZoeProjectAgentError,
  ZOE_PROJECT_AGENT_MAX_STEPS} from "./zoeProjectAgentLoop";

function workspace(files: Record<string,string>): WorkspaceStateV2 {
  const nodes: Record<string,unknown>[] = [];
  const dirs = new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const parts=path.split("/");
    let parentId:string|null=null;
    for(let i=0;i<parts.length-1;i++) {
      const key=parts.slice(0,i+1).join("/");
      if(!dirs.has(key)) {
        const id=`d:${key}`;
        nodes.push({id,kind:"folder",name:parts[i],parentId,createdAt:1,updatedAt:1});
        dirs.set(key,id);
      }
      parentId=dirs.get(key)!;
    }
    nodes.push({id:`f:${path}`,kind:"file",name:parts.at(-1),parentId,
      content,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes,openTabs:[],activeFileId:null,entryFileId:null,
    stdin:"",expanded:[],leftPct:25} as unknown as WorkspaceStateV2;
}
function action(kind:string, props:Record<string,unknown>={}) {
  return JSON.stringify({kind,path:"",query:"",prefix:"",offset:0,limit:24000,
    summary:"",edits:[],patches:[],reads:[],...props});
}
async function run(files:Record<string,string>,responses:string[]) {
  const prompts: Array<{user:string;system:string}> = [];
  const source=workspace(files);
  const result=await runZoeProjectAgent({workspace:source,
    userRequest:"Consolidate shared layouts throughout the existing project",
    conversation:[],system:"Preserve navigation and routes",
    project:{title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null},
    maxSteps:responses.length,
    generate:async(request,index)=>{prompts.push({user:request.user,system:request.system});
      return {text:responses[index]!};},
  });
  return {result,prompts,source};
}

describe("V12K10H efficient, authorized, project-wide model inspection",()=>{
  it("provides a source manifest without a separate model list action and fully reads five related pages in one step",async()=>{
    const files={
      "src/App.tsx":"<header>Home</header><main>Home</main>",
      "src/pages/contact.tsx":"<header>Contact</header><main>Contact form</main>",
      "src/pages/studio.tsx":"<header>Studio</header><main>Studio</main>",
      "src/pages/approach.tsx":"<main>Approach</main>",
      "src/pages/what-we-do.tsx":"<header>Services</header><main>Services</main>",
    };
    const paths=Object.keys(files);
    const responses=[
      action("read_many",{reads:paths.map(path=>({path,offset:0,limit:24000}))}),
      action("patch",{patches:[
        {path:"src/App.tsx",before:"<header>Home</header>",after:"<SharedHeader/>"},
        {path:"src/pages/contact.tsx",before:"<header>Contact</header>",after:"<SharedHeader/>"},
        {path:"src/pages/studio.tsx",before:"<header>Studio</header>",after:"<SharedHeader/>"},
        {path:"src/pages/what-we-do.tsx",before:"<header>Services</header>",after:"<SharedHeader/>"},
      ]}),
      action("propose",{summary:"All duplicate headers consolidated"}),
    ];
    const {result,prompts,source}=await run(files,responses);
    expect(JSON.parse(prompts[0]!.user).initialInventory.entries.map((item:{path:string})=>item.path))
      .toEqual(paths.slice().sort((a,b)=>a.localeCompare(b)));
    expect(JSON.parse(prompts[1]!.user).observations[0].response.reads).toHaveLength(5);
    expect([...result.fullyReadPaths].sort()).toEqual(paths.sort());
    expect(JSON.parse(result.text).edits).toHaveLength(4);
    expect(result.steps).toBe(3);
    expect(source.nodes.some(n=>n.kind==="file"&&n.content==="<header>Home</header><main>Home</main>"))
      .toBe(true);
  });

  it("does not misclassify source as fully read when a batch runs out of response space",async()=>{
    const files={"src/pages/one.tsx":"A".repeat(24000),
      "src/pages/two.tsx":"B".repeat(24000)};
    const {result,prompts}=await run(files,[
      action("read_many",{reads:[
        {path:"src/pages/one.tsx",offset:0,limit:24000},
        {path:"src/pages/two.tsx",offset:0,limit:24000},
      ]}),
      action("patch",{patches:[{path:"src/pages/two.tsx",before:"BBBB",after:"C"}]}),
      action("propose",{summary:"No changes because source is incomplete"}),
    ]);
    const observation=JSON.parse(prompts[1]!.user).observations[0].response;
    expect(observation.reads[1].result.content).toHaveLength(16000);
    expect(observation.reads[1].result.nextOffset).toBe(16000);
    expect(JSON.parse(prompts[2]!.user).observations[1].response.error)
      .toBe("EXISTING_SOURCE_NOT_FULLY_READ");
    expect(result.fullyReadPaths).toEqual(["src/pages/one.tsx"]);
    expect(JSON.parse(result.text).edits).toEqual([]);
  });

  it("can resume an incomplete batch and safely stage a patch after complete reading",async()=>{
    const large="A".repeat(27000);
    const {result,prompts}=await run({"src/App.tsx":large},[
      action("read_many",{reads:[{path:"src/App.tsx",offset:0,limit:24000}]}),
      action("read_many",{reads:[{path:"src/App.tsx",offset:24000,limit:24000}]}),
      action("patch",{patches:[{path:"src/App.tsx",before:"A".repeat(50),after:"B"}]}),
      action("propose",{summary:"Rejected ambiguous anchor"}),
    ]);
    expect(JSON.parse(prompts[3]!.user).observations[2].response.error).toBe("PATCH_ANCHOR_AMBIGUOUS");
    expect(result.fullyReadPaths).toContain("src/App.tsx");
    expect(JSON.parse(result.text).edits).toHaveLength(0);
  });

  it("preserves the existing finite metered step ceiling and does not silently run another model call",async()=>{
    expect(ZOE_PROJECT_AGENT_MAX_STEPS).toBe(12);
    let called=0;
    await expect(runZoeProjectAgent({workspace:workspace({"src/App.tsx":"source"}),
      userRequest:"Improve site",conversation:[],system:"",maxSteps:2,
      project:{title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null},
      generate:async()=>{called++;return {text:action("read_many",{reads:[
        {path:"src/App.tsx",offset:0,limit:24000}]})};},
    })).rejects.toMatchObject({name:"ZoeProjectAgentError",code:"AGENT_INSPECTION_INCOMPLETE"});
    expect(called).toBe(2);
  });

  it("does not confuse the initial 80-entry inventory page with a whole-project limit",async()=>{
    const files=Object.fromEntries(Array.from({length:120},(_,i)=>
      [`src/pages/page${String(i).padStart(3,"0")}.tsx`,"export default function Page(){return null}"]));
    const {prompts,result}=await run(files,[action("list",{offset:80,limit:100}),
      action("propose",{summary:"Read-only index check"})]);
    const initial=JSON.parse(prompts[0]!.user).initialInventory;
    expect(initial.entries).toHaveLength(80);
    expect(initial.nextOffset).toBe(80);
    const following=JSON.parse(prompts[1]!.user).observations[0].response;
    expect(following.total).toBe(120);
    expect(following.entries).toHaveLength(40);
    expect(result.steps).toBe(2);
  });

  it("uses the owner-authorized file tools for batch reads and blocks protected source",async()=>{
    const {prompts,result}=await run({"src/App.tsx":"safe",".env.local":"private"},[
      action("read_many",{reads:[{path:".env.local",offset:0,limit:24000}]}),
      action("propose",{summary:"No unsafe access"}),
    ]);
    expect(JSON.parse(prompts[1]!.user).observations[0].response.reads[0].result.error)
      .toBe("INVALID_PATH");
    expect(result.fullyReadPaths).toEqual([]);
  });

  it("advertises batched reads in strict provider schema",()=>{
    const schema=zoeProjectAgentResponseSchema();
    expect(schema.properties.kind.enum).toContain("read_many");
    expect(schema.required).toContain("reads");
    expect(schema.properties.reads.items.required).toEqual(["path","offset","limit"]);
  });
});
