import {describe,expect,it} from "vitest";
import {pathOf} from "@zoeskoul/learner-workspace/ide/fsTree";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {applyZoeEditsToWorkspace,sha256,validateZoeEdits} from "./zoeTargetedSourceEdit";
import {isZoeReactPageRoute,renderZoeReactRouter,wireZoeReactEntry,pageSourcePath,
  ZOE_REACT_ROUTER_MARKER} from "./zoeReactRouteEdits";
import {parseZoeSemanticIntent} from "./zoeSemanticIntent";

const main = `import App from "./App";\ncreateRoot(root).render(<App />);`;
function project():WorkspaceStateV2{
  return {version:2,language:"web",leftPct:26,stdin:"",expanded:["src"],openTabs:["app"],
    entryFileId:"main",activeFileId:"app",nodes:[
      {id:"src",kind:"folder",name:"src",parentId:null,createdAt:1,updatedAt:1},
      {id:"main",kind:"file",name:"main.tsx",parentId:"src",content:main,createdAt:1,updatedAt:1},
      {id:"app",kind:"file",name:"App.tsx",parentId:"src",content:"export default function App(){return <main>Home</main>}",createdAt:1,updatedAt:1},
      {id:"index",kind:"file",name:"index.html",parentId:null,content:'<div id="root"></div>',createdAt:1,updatedAt:1},
    ]};
}
const code='export default function Approach(){return <main>Our approach</main>}';
describe("V12K3 React routes and source-review apply",()=>{
  it("accepts model-selected route paths, not arbitrary files or reserved endpoints",()=>{
    expect(parseZoeSemanticIntent({action:"edit",pagePath:"/our-approach",provider:"",reply:""}).pagePath).toBe("/our-approach");
    for(const route of ["/api","/billing","/APPROACH","/foo/bar","/../env","/a.html"]){
      expect(isZoeReactPageRoute(route)).toBe(false);
    }
    expect(pageSourcePath("/our-approach")).toBe("src/pages/our-approach.tsx");
  });
  it("wires the canonical entry while refusing noncanonical bootstraps",()=>{
    const wired=wireZoeReactEntry(main);
    expect(wired).toContain('import ZoePages from "./ZoePages";');
    expect(wired).toContain("<ZoePages />");
    expect(wireZoeReactEntry(wired)).toBe(wired);
    expect(()=>wireZoeReactEntry("import X from './custom'" )).toThrow("BUILD_REACT_ENTRY_UNSUPPORTED");
  });
  it("renders two pages, native History API links, published/preview base paths and Back/Forward listener",()=>{
    const result=renderZoeReactRouter(["our-approach","faq","our-approach"]);
    expect(result).toContain(ZOE_REACT_ROUTER_MARKER);
    expect(result).toContain('import Page0 from "./pages/faq"');
    expect(result).toContain('import Page1 from "./pages/our-approach"');
    // Site navigation is authored in App.tsx; don't inject a duplicate header.
    expect(result).not.toContain('aria-label="Pages"');
    expect(result).toContain('document.addEventListener("click",onInternalLink,true)');
    expect(result).toContain('useLayoutEffect(()=>{');
    expect(result).toContain('const observer=new MutationObserver(repairLinks)');
    expect(result).toContain('link.setAttribute("href",routed)');
    expect(result).toContain('url.pathname.startsWith(root+"/")');
    // The canonical base-aware resolver constructs the route URL; it no longer
    // relies on building URLs directly inside the click listener.
    expect(result).toContain('const next=routeTarget(original)');
    expect(result).toContain('return root+"/"+slug+url.search+url.hash');
    expect(result).toContain('window.history.pushState');
    expect(result).toContain('window.addEventListener("popstate"');
    expect(result).toContain('import.meta.env.BASE_URL');
    expect(result).toContain('/^\\/sites\\/');
  });
  it("applies reviewed React new file, nested folder, registry and bootstrap atomically",()=>{
    const before=project();
    const route=renderZoeReactRouter(["our-approach"]);
    const edits=[
      {path:"src/pages/our-approach.tsx",content:code,create:true,beforeSha256:sha256("")},
      {path:"src/ZoePages.tsx",content:route,create:true,beforeSha256:sha256("")},
      {path:"src/main.tsx",content:wireZoeReactEntry(main),beforeSha256:sha256(main)},
    ];
    expect(validateZoeEdits(before,edits)).toHaveLength(3);
    const after=applyZoeEditsToWorkspace(before,edits);
    expect(after.nodes.filter(node=>node.kind==="file").map(node=>pathOf(after.nodes,node.id)))
      .toContain("src/pages/our-approach.tsx");
    expect(after.nodes.find(node=>node.kind==="file" && node.id==="app"))
      .toEqual(before.nodes.find(node=>node.id==="app"));
    expect(()=>validateZoeEdits(after,edits)).toThrow();
  });
  it("rejects page/router mixups and self-imports before saving a proposal",()=>{
    const before=project();
    const invalidPage=`// @zoebuild-pages-v1\nimport Page0 from "./pages/approach";\nexport default function App(){return <Page0/>}`;
    for(const content of [invalidPage,
      `import App from "../ZoePages"; export default App;`,
      `import Approach from "./approach"; export default Approach;`]){
      let rejection: unknown = null;
      try {
        validateZoeEdits(before,[{path:"src/pages/approach.tsx",create:true,
          content,beforeSha256:sha256("")}]);
      } catch (error) { rejection = error; }
      // Assert the structured public error code, not a human-readable message.
      expect(rejection).toMatchObject({code:"BUILD_REACT_PAGE_IMPORT_CYCLE",
        message:expect.stringContaining("src/pages/approach.tsx")});
    }
    expect(validateZoeEdits(before,[{path:"src/pages/approach.tsx",create:true,
      content:code,beforeSha256:sha256("")}])).toHaveLength(1);
  });
  it("blocks arbitrary new files, unsafe names, stale edits and missing default export",()=>{
    const before=project();
    const baseline={content:code,create:true,beforeSha256:sha256("")};
    for(const path of [".env","src/pages/../secret.tsx","src/pages/admin.tsx","src/auth/secret.tsx"]){
      expect(()=>validateZoeEdits(before,[{...baseline,path}])).toThrow();
    }
    expect(()=>validateZoeEdits(before,[{...baseline,path:"src/pages/valid.tsx",content:"const x=1"}])).toThrow();
    expect(()=>validateZoeEdits(before,[{...baseline,path:"src/pages/valid.tsx",beforeSha256:sha256("different")}])).toThrow();
  });
});
