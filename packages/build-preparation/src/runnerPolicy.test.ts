import { describe, expect, it } from "vitest";
import { BuildPreparationError, assertRegisteredDependencyBootstrapFiles } from "./index";
import { fresh, projectId, specification } from "./tanstackTestFixtures";

function sourceFiles() {
  const ws=fresh();
  const nodes=new Map(ws.nodes.map(n=>[n.id,n]));
  const pathOf=(id:string):string=>{const node=nodes.get(id);if(!node)throw new Error(id);
    return node.parentId ? `${pathOf(node.parentId)}/${node.name}` : node.name;};
  return ws.nodes.flatMap(n=>n.kind==="file"?[{path:pathOf(n.id),content:n.content}]:[]);
}

describe("TanStack-only dependency bootstrap policy",()=>{
  it("admits the registered template without a lock",()=>{
    expect(()=>assertRegisteredDependencyBootstrapFiles({
      stackId:specification.stackId,templateId:"tanstack-start-v1",buildProjectId:projectId,files:sourceFiles(),
    })).not.toThrow();
  });
  it("rejects dependency mutation and legacy stack identities",()=>{
    const changed=sourceFiles().map(f=>f.path==="package.json"?{
      ...f,content:JSON.stringify({...JSON.parse(f.content),dependencies:{react:"0.0.0"}})}:f);
    expect(()=>assertRegisteredDependencyBootstrapFiles({
      stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",files:changed,
    })).toThrow(BuildPreparationError);
    expect(()=>assertRegisteredDependencyBootstrapFiles({
      stackId:"react-vite-v1",templateId:"react-vite-v1",files:sourceFiles(),
    })).toThrow(BuildPreparationError);
  });
});
