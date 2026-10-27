import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { sha256 } from "./zoeTargetedSourceEdit";
import { planZoeReactPageEdit, verifyZoeReactEditSources } from "./zoeReactEditReadiness";
import { readFileSync } from "node:fs";

function workspace(values: Record<string,string>): WorkspaceStateV2 {
  let id = 0;
  const folders = new Map<string,string>();
  const nodes: Record<string,unknown>[] = [];
  for (const [path,content] of Object.entries(values)) {
    const parts = path.split("/");
    let prefix="", parentId:string|null=null;
    for (const part of parts.slice(0,-1)) {
      prefix=prefix?prefix+"/"+part:part;
      if (!folders.has(prefix)) {
        const key=`id-${++id}`;
        nodes.push({id:key,kind:"folder",name:part,parentId,createdAt:1,updatedAt:1});
        folders.set(prefix,key);
      }
      parentId=folders.get(prefix)!;
    }
    nodes.push({id:`id-${++id}`,kind:"file",name:parts.at(-1),content,parentId,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes} as unknown as WorkspaceStateV2;
}
const base = {"src/App.tsx":"import Header from './components/Header'; export default function App(){return <Header/>}",
  "src/components/Header.tsx":"export default function Header(){return <header>Forma</header>}",
  "src/styles.css":"body { color: black; }", "src/main.tsx":"import App from './App';"};
const page = "import Header from '../components/Header';import '../styles.css'; export default function Approach(){return <Header/>;}";
const file = (path:string, content:string, create=false) => ({path,content,beforeSha256:sha256(create?"":(base as Record<string,string>)[path]??""),...(create?{create:true as const}:{})});

describe("Zoé React edit readiness is not a fabricated build",()=>{
  it("makes a specific plan without authorizing changes to reference files",()=>{
    const plan=planZoeReactPageEdit('/approach',["src/App.tsx","src/styles.css"],["src/big.css"]);
    expect(plan.requiredPageFile).toBe("src/pages/approach.tsx");
    expect(plan.optionalHomepageFile).toBe("src/App.tsx");
    expect(plan.serverOwnedFiles).toContain("src/routes/AppRoutes.tsx");
    expect(plan.missingDesignReferences).toContain("src/big.css");
    expect(()=>planZoeReactPageEdit('https://attacker.test/',[],[])).toThrow();
  });
  it("checks local references in the proposed page and classifies source readiness honestly",()=>{
    const verified=verifyZoeReactEditSources({workspace:workspace(base),
      edits:[file("src/pages/approach.tsx",page,true)],requestedPage:"src/pages/approach.tsx",sourceVersion:4});
    expect(verified).toMatchObject({stage:"source-validated",build:"not-run",browser:"not-run",checkedLocalImports:2,sourceVersion:4});
    expect(verified.operations).toEqual([{path:"src/pages/approach.tsx",action:"create",responsibility:"React page content"}]);
  });
  it("finds a newly proposed component import in the resulting edited workspace",()=>{
    const checked=verifyZoeReactEditSources({workspace:workspace(base),
      edits:[file("src/pages/approach.tsx", "import App from '../App'; export default function Approach(){return <App/>}",true),
        file("src/App.tsx","import Header from './components/Header'; export default function App(){return <Header/>}")],
      requestedPage:"src/pages/approach.tsx",sourceVersion:2});
    expect(checked.checkedLocalImports).toBe(2);
  });
  it("rejects missing local modules before returning any proposal",()=>{
    expect(()=>verifyZoeReactEditSources({workspace:workspace(base),
      edits:[file("src/pages/approach.tsx","import Missing from '../components/Unmade';export default function Approach(){return <Missing/>}",true)],
      requestedPage:"src/pages/approach.tsx",sourceVersion:3})).toThrow("does not resolve");
  });
  it("rejects imports outside the source tree; accepts package imports",()=>{
    expect(()=>verifyZoeReactEditSources({workspace:workspace(base),
      edits:[file("src/pages/approach.tsx","import x from '../../../secret';export default function P(){return null}",true)],
      requestedPage:"src/pages/approach.tsx",sourceVersion:2})).toThrow("escapes");
    const valid=verifyZoeReactEditSources({workspace:workspace(base),edits:[file("src/pages/approach.tsx",
      'import React from "react"; export default function P(){return null}',true)],requestedPage:"src/pages/approach.tsx",sourceVersion:2});
    expect(valid.checkedLocalImports).toBe(0);
  });
  it("checks readiness before proposing, and compiles exactly once at Apply before saving",()=>{
    const route=readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",import.meta.url),"utf8");
    const postStart=route.indexOf('export async function POST(');
    const patchStart=route.indexOf('export async function PATCH(');
    expect(postStart).toBeGreaterThan(-1);
    expect(patchStart).toBeGreaterThan(postStart);
    const propose=route.slice(postStart,patchStart);
    const apply=route.slice(patchStart);

    // Proposal is validated in memory, with no runner invocation or source save.
    expect(propose).toContain('const edits = validateZoeEdits(project.workspace, reactProposed ?? proposed)');
    expect(propose).toContain('verifyZoeReactEditSources({');
    expect(propose.indexOf('validateZoeEdits(project.workspace, reactProposed ?? proposed)'))
      .toBeLessThan(propose.indexOf('verifyZoeReactEditSources({'));
    expect(propose).toContain('sourceVersion: project.sourceVersion');
    expect(propose).toContain('applyZoeEditsToWorkspace(project.workspace, edits)');
    expect(propose).toContain('previewZoeEdits(');
    expect(propose).toContain('Isolated build will run before saving; browser rendering not verified.');
    expect(propose).not.toContain('await verifyZoeReactCandidateAtRunner(');
    expect(propose).not.toContain('saveBuildProjectSourceCommand({');
    expect(propose).toContain('requireZoeAiBillingOperationId');

    // Apply is an authorized, versioned, fail-closed mutation, without another AI call.
    expect(apply).toContain('if (project.sourceVersion !== body.baseVersion)');
    expect(apply).toContain('const validatedEdits = validateZoeEdits(project.workspace, body.edits)');
    expect(apply).toContain('const workspace = applyZoeEditsToWorkspace(project.workspace, validatedEdits)');
    expect(apply.match(/await verifyZoeReactCandidateAtRunner\(\{/g)).toHaveLength(1);
    expect(apply).toContain('if (verification.state !== "passed") return result(');
    expect(apply).toContain('No source was saved.');
    expect(apply).toContain('const saved = await saveBuildProjectSourceCommand({');
    expect(apply.indexOf('await verifyZoeReactCandidateAtRunner({'))
      .toBeLessThan(apply.indexOf('if (verification.state !== "passed") return result('));
    expect(apply.indexOf('if (verification.state !== "passed") return result('))
      .toBeLessThan(apply.indexOf('const saved = await saveBuildProjectSourceCommand({'));
    expect(apply).not.toContain('generateJsonText(');
  });
});
