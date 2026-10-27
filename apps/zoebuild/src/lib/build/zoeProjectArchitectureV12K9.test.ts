import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { selectZoeReactDesignEvidence } from "./zoeReactDesignEvidence";
import {
  applyZoeEditsToWorkspace, sha256, validateZoeEdits, ZoeEditInputError,
} from "./zoeTargetedSourceEdit";

function workspace(sources: Record<string, string>): WorkspaceStateV2 {
  const nodes: Record<string, unknown>[] = [];
  const folders = new Map<string, string>();
  for (const [path, content] of Object.entries(sources)) {
    let parentId: string | null = null;
    const segments = path.split("/");
    for (let i = 0; i < segments.length - 1; i++) {
      const pathKey = segments.slice(0, i + 1).join("/");
      if (!folders.has(pathKey)) {
        const id = `folder:${pathKey}`;
        nodes.push({id, kind:"folder", name:segments[i], parentId, createdAt:1, updatedAt:1});
        folders.set(pathKey, id);
      }
      parentId = folders.get(pathKey)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:segments.at(-1),parentId,
      content,createdAt:1,updatedAt:1});
  }
  // Use the same complete WorkspaceStateV2 shape as production source saves.
  // parseBuildWorkspaceMutation must validate this fixture rather than being
  // bypassed or weakened for architectural component creation.
  const activeId = "file:src/App.tsx";
  return {
    version: 2,
    language: "web",
    nodes,
    openTabs: [activeId],
    activeFileId: activeId,
    entryFileId: activeId,
    stdin: "",
    expanded: ["folder:src"],
    leftPct: 25,
  } as unknown as WorkspaceStateV2;
}

const base = () => workspace({
  "index.html":"<html><body><div id=\"root\"></div></body></html>",
  "src/main.tsx":"import App from './App'; export default App;",
  "src/App.tsx":"export default function App(){return <main>Home</main>}",
  "src/pages/contact.tsx":"export default function Contact(){return <main>Contact</main>}",
  "src/pages/studio.tsx":"export default function Studio(){return <main>Studio</main>}",
  "src/pages/approach.tsx":"export default function Approach(){return <main>Approach</main>}",
  "src/pages/what-we-do.tsx":"export default function Services(){return <main>Services</main>}",
});

function create(path: string, content = "export function Shared(){return <header>Brand</header>}") {
  return {path,create:true as const,content,beforeSha256:sha256("")};
}

describe("V12K9 semantic React architecture and safe multi-file extraction", () => {
  it("exposes the existing route set in read-only evidence instead of just three siblings", () => {
    const evidence = selectZoeReactDesignEvidence(base(), "src/App.tsx");
    expect(evidence.sourceInventory.map(file => file.path)).toEqual(expect.arrayContaining([
      "src/App.tsx", "src/pages/contact.tsx", "src/pages/approach.tsx",
      "src/pages/studio.tsx", "src/pages/what-we-do.tsx",
    ]));
    expect(evidence.files.filter(file => file.role === "existing-page")).toHaveLength(4);
    expect(evidence.sourceCoverage).toBe("bounded-partial-evidence");
  });
  it("creates the canonical shared source under its real src/components folder", () => {
    const ws=base();
    const edits=[create("src/components/shared/SiteLayout.tsx")];
    expect(validateZoeEdits(ws,edits)).toHaveLength(1);
    const updated=applyZoeEditsToWorkspace(ws,edits);
    expect(updated.version).toBe(2);
    expect(updated.leftPct).toBe(25);
    expect(updated.nodes.find(n => n.kind === "file" && pathOf(updated.nodes,n.id) ===
      "src/components/shared/SiteLayout.tsx")).toMatchObject({kind:"file"});
    expect(ws.nodes.some(n => n.kind === "file" && n.name === "SiteLayout.tsx")).toBe(false);
  });
  it("accepts one new component and five reviewed page changes atomically", () => {
    const ws=base();
    const originals=ws.nodes.flatMap(n => n.kind === "file" && !n.binary
      ? [[pathOf(ws.nodes,n.id),n.content] as const] : []);
    const edits=[create("src/components/SiteLayout.tsx"),...originals
      .filter(([path]) => path === "src/App.tsx" || path.startsWith("src/pages/"))
      .map(([path,content]) => ({path,content:content+"\n// shared layout import",beforeSha256:sha256(content)}))];
    expect(edits).toHaveLength(6);
    expect(validateZoeEdits(ws,edits)).toHaveLength(6);
    const updated=applyZoeEditsToWorkspace(ws,edits);
    expect(updated.version).toBe(2);
    expect(updated.leftPct).toBe(25);
    expect(updated.nodes.filter(n => n.kind === "file")).toHaveLength(8);
  });
  it("edits an existing large React file without a 16000-character cutoff", () => {
    const source = `export default function App(){return <main>${"X".repeat(25_000)}</main>}`;
    const ws=workspace({
      "src/main.tsx":"import App from './App'; export default App;",
      "src/App.tsx":source,
    });
    const next=source.replace("X".repeat(25_000),"Y".repeat(25_000));
    const edits=[{path:"src/App.tsx",content:next,beforeSha256:sha256(source)}];
    expect(validateZoeEdits(ws,edits)).toHaveLength(1);
    const updated=applyZoeEditsToWorkspace(ws,edits);
    expect(updated.nodes.find(node=>node.kind==="file" && node.name==="App.tsx")).toMatchObject({content:next});
    expect(ws.nodes.find(node=>node.kind==="file" && node.name==="App.tsx")).toMatchObject({content:source});
  });
  it("rejects traversal, protected configs and existing-path overwrites", () => {
    const ws=base();
    for(const path of [
      "src/components/../secret.tsx", "src/components/.env.tsx",
      "src/components/../../App.tsx", "src/components/Bad.ts",
      "src/components/config/../../evil.css", "package.json",
      "src/components/", "src/App.tsx",
    ]) expect(() => validateZoeEdits(ws,[create(path)])).toThrow(ZoeEditInputError);
  });
  it("rejects stale hashes while supporting many approved edits", () => {
    const ws=base();
    expect(() => validateZoeEdits(ws,[{...create("src/components/Shared.tsx"),
      beforeSha256:sha256("different")}])).toThrow(ZoeEditInputError);
    const largeRefactor = Array.from({length:20},(_,i) => create(`src/components/Shared${i}.tsx`));
    expect(validateZoeEdits(ws, largeRefactor)).toHaveLength(20);
    const updated = applyZoeEditsToWorkspace(ws, largeRefactor);
    expect(updated.nodes.filter(node => node.kind === "file")).toHaveLength(27);
  });
});
