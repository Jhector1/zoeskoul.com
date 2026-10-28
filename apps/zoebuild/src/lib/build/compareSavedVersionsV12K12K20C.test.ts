import { describe,it,expect } from "vitest";
import { compareSavedVersionSnapshots } from "./compareSavedVersions";
const snapshot=(files:Record<string,string>)=>{
  const nodes:Array<{id:string;parentId:string|null;name:string;kind:string;content?:string}>=[];
  const seen=new Set<string>();
  for(const [path,content] of Object.entries(files)){
    const segments=path.split("/");let parentId:string|null=null;
    for(let i=0;i<segments.length;i++){
      const id=segments.slice(0,i+1).join("/");
      if(!seen.has(id)){
        nodes.push({id,parentId,name:segments[i],kind:i===segments.length-1?"file":"folder",
          ...(i===segments.length-1?{content}:{})});seen.add(id);
      }
      parentId=id;
    }
  }
  return {nodes};
};

describe("K20C complete read-only version comparison",()=>{
  it("identifies pages, components and dependency edits beyond 6k excerpt limits",()=>{
    const before=snapshot({"src/App.tsx":"X".repeat(9000)+"one",
      "src/components/Header.tsx":"before","package.json":"old","src/pages/Old.tsx":"yes"});
    const after=snapshot({"src/App.tsx":"X".repeat(9000)+"two",
      "src/components/Header.tsx":"after","package.json":"new","src/pages/New.tsx":"yes"});
    const result=compareSavedVersionSnapshots(before,after);
    expect(result.counts).toEqual({pages:3,components:1,dependencies:1,other:0});
    expect(result.changes).toContainEqual({path:"src/App.tsx",kind:"changed",group:"pages"});
    expect(result.changes).toContainEqual({path:"src/pages/Old.tsx",kind:"removed",group:"pages"});
    expect(result.changes).toContainEqual({path:"src/pages/New.tsx",kind:"added",group:"pages"});
    expect(JSON.stringify(result)).not.toContain("X".repeat(20));
  });
  it("excludes source content and secrets from returned metadata",()=>{
    const result=compareSavedVersionSnapshots(snapshot({"src/.env.local":"private key","src/App.tsx":"before"}),
      snapshot({"src/.env.local":"new secret","src/App.tsx":"after"}));
    expect(result.changes.map(x=>x.path)).toEqual(["src/App.tsx"]);
    expect(JSON.stringify(result)).not.toContain("private key");
  });
});
