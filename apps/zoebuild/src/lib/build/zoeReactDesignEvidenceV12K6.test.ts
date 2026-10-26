import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { selectZoeReactDesignEvidence } from "./zoeReactDesignEvidence";

function workspace(files: Readonly<Record<string,string>>): WorkspaceStateV2 {
  const dirs = new Map<string,string>();
  const nodes: Array<Record<string,unknown>> = [];
  for (const [path,content] of Object.entries(files)) {
    const bits=path.split("/");
    let parentId:string|null=null, prefix="";
    for (const bit of bits.slice(0,-1)) {
      prefix=prefix?`${prefix}/${bit}`:bit;
      if (!dirs.has(prefix)) {
        const id=`folder:${prefix}`;
        nodes.push({id,kind:"folder",name:bit,parentId,createdAt:1,updatedAt:1});
        dirs.set(prefix,id);
      }
      parentId=dirs.get(prefix)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:bits.at(-1),parentId,
      content,binary:false,createdAt:1,updatedAt:1});
  }
  return {nodes} as unknown as WorkspaceStateV2;
}

describe("V12K6 read-only React sibling design references",()=>{
  it("shows existing sibling pages, app and actual shared components, not just homepage",()=>{
    const evidence=selectZoeReactDesignEvidence(workspace({
      "src/App.tsx":"import Header from './components/Header'; export default function App(){return <Header/>}",
      "src/components/Header.tsx":"export default function Header(){return <nav>Forma</nav>}",
      "src/pages/studio.tsx":"export default function Studio(){return <main>Studio</main>}",
      "src/pages/about.tsx":"export default function About(){return <main>About</main>}",
    }),"src/pages/contact.tsx");
    const paths=evidence.files.map(f=>f.path);
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("src/components/Header.tsx");
    expect(paths).toContain("src/pages/studio.tsx");
    expect(paths).toContain("src/pages/about.tsx");
    expect(evidence.designPrinciples.join(" ")).toContain("Do not duplicate");
  });
  it("omits additional sibling pages rather than sending unbounded project source",()=>{
    const pages=Object.fromEntries(["one","two","three","four","five"].map(v=>
      [`src/pages/${v}.tsx`,`export default function Page(){return <main>${v}</main>}`]));
    const evidence=selectZoeReactDesignEvidence(workspace({"src/App.tsx":"export default function App(){return null}",...pages}),"src/pages/new.tsx");
    expect(evidence.files.filter(f=>f.path.startsWith("src/pages/")).length).toBe(3);
    expect(evidence.omittedPaths).toEqual(expect.arrayContaining(["src/pages/three.tsx","src/pages/two.tsx"]));
  });
});
