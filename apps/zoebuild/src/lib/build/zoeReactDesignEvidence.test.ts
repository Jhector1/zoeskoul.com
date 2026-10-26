import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { selectZoeReactDesignEvidence } from "./zoeReactDesignEvidence";

function workspace(values: Record<string, string>): WorkspaceStateV2 {
  let nextId = 0;
  const folderIds = new Map<string, string>();
  const nodes: Array<Record<string, unknown>> = [];
  for (const [path, content] of Object.entries(values)) {
    const parts = path.split("/");
    let prefix = "";
    let parentId: string | null = null;
    for (const part of parts.slice(0, -1)) {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (!folderIds.has(prefix)) {
        const id = `id-${++nextId}`;
        nodes.push({id, name:part, kind:"folder", parentId, createdAt:1, updatedAt:1});
        folderIds.set(prefix,id);
      }
      parentId = folderIds.get(prefix)!;
    }
    nodes.push({id:`id-${++nextId}`, name:parts.at(-1), kind:"file", parentId,
      content, createdAt:1, updatedAt:1});
  }
  return {version:2, language:"web", nodes, leftPct:30, openTabs:[], expanded:[]} as unknown as WorkspaceStateV2;
}

describe("Zoé React design-grounded page context", () => {
  it("sends existing brand CSS, imported header and component style instead of just App.tsx", () => {
    const w = workspace({
      "src/App.tsx": `import './App.css'; import Header from './components/Header';\nexport default function App(){return <><Header/><main className="brand-hero">Our approach</main></>}`,
      "src/components/Header.tsx": `import './Header.css'; export default function Header(){return <nav className="brand-nav">Forma</nav>}`,
      "src/components/Header.css": `.brand-nav {display:flex;gap:2rem}`,
      "src/App.css": `.brand-hero{color:#e8715b;font-family:Georgia}`,
      "src/index.css": `:root{--background:#f7f5ec;font-family:'Inter'}`,
      "src/main.tsx": `import './index.css';`,
      "src/pages/approach.tsx": `export default function Approach(){return <h1>Old</h1>}`,
    });
    const evidence = selectZoeReactDesignEvidence(w,"src/pages/approach.tsx");
    expect(evidence.files.map(f=>f.path)).toEqual(expect.arrayContaining([
      "src/App.tsx", "src/App.css", "src/index.css", "src/components/Header.tsx",
      "src/components/Header.css", "src/main.tsx", "src/pages/approach.tsx",
    ]));
    expect(evidence.files.find(f=>f.path==="src/App.css")?.content).toContain("#e8715b");
    expect(evidence.files.find(f=>f.path==="src/components/Header.tsx")?.content).toContain("brand-nav");
    expect(evidence.sourceCoverage).toBe("bounded-partial-evidence");
  });

  it("resolves Vite @/components aliases only within the known safe source tree", () => {
    const w=workspace({
      "src/App.tsx": `import Header from '@/components/Header'; export default function App(){return <Header/>}`,
      "src/components/Header.tsx": `export default function Header(){return <header>Shared brand</header>}`,
      "src/config/admin.tsx": "do not disclose",
    });
    const evidence=selectZoeReactDesignEvidence(w,"src/pages/approach.tsx");
    expect(evidence.files.map(f=>f.path)).toContain("src/components/Header.tsx");
    expect(JSON.stringify(evidence)).not.toContain("do not disclose");
  });

  it("uses bounded excerpts of large references without raising editable-file limits", () => {
    const content = `import './App.css';\n${"const a=0;\n".repeat(2_000)}\nexport default function App(){return <main>End</main>}`;
    expect(content.length).toBeGreaterThan(16_000);
    const w=workspace({"src/App.tsx":content,"src/App.css":"body { color: coral }"});
    const evidence=selectZoeReactDesignEvidence(w,"src/pages/new.tsx");
    const home=evidence.files.find(f=>f.path==="src/App.tsx")!;
    expect(home.truncated).toBe(true);
    expect(home.content).toContain("import './App.css'");
    expect(home.content).toContain("export default function App()");
    expect(evidence.files.find(f=>f.path==="src/App.css")?.content).toContain("coral");
    expect(evidence.files.reduce((sum,f)=>sum+f.content.length,0)).toBeLessThanOrEqual(48_000);
  });

  it("never sends credential-bearing, hidden, unapproved, or binary-like paths as design evidence", () => {
    const w=workspace({
      "src/App.tsx":"export default function App(){return <main>Safe</main>}",
      "src/index.css":".secret { content: 'sk_live_abcdefghijklmnopqrst' }",
      "src/components/Header.tsx":"sk-proj-abcdefghijklmnopqrstuvwxy",
      "src/config/admin.tsx":"private-config",
      "src/.hidden.css":"private-css",
      ".env":"DATABASE_URL=secret",
      "src/pages/approach.tsx":"export default function Page(){return <div>Hello</div>}",
    });
    const evidence=selectZoeReactDesignEvidence(w,"src/pages/approach.tsx");
    const serialized=JSON.stringify(evidence);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("private-config");
    expect(serialized).not.toContain("private-css");
    expect(serialized).not.toContain("sk-proj-");
    expect(serialized).not.toContain("sk_live_");
    expect(evidence.files.some(f=>f.path==="src/pages/approach.tsx")).toBe(true);
  });

  it("reports incomplete coverage instead of silently implying design parity", () => {
    const w=workspace({"src/App.tsx": "const a=1", "src/App.css": "a".repeat(160_001)});
    const evidence=selectZoeReactDesignEvidence(w,"src/pages/new.tsx");
    expect(evidence.omittedPaths).toContain("src/App.css");
    expect(evidence.files.map(f=>f.path)).not.toContain("src/App.css");
  });
  it("the authorized edit route passes real design references without expanding file permissions", () => {
    const source = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts", import.meta.url), "utf8");
    expect(source).toContain("selectZoeReactDesignEvidence(project.workspace, targetPageSource!)");
    expect(source).toContain("files: staticPageContext, editPlan: reactEditPlan, designEvidence: reactDesignEvidence");
    expect(source).toContain("const reactEditPlan = reactPage ? planZoeReactPageEdit(");
    expect(source).toContain("The server wires route dispatch and existing source entry, NOT the visible header link");
    expect(source).toContain("validateZoeEdits(project.workspace, reactProposed ?? proposed)");
    expect(source).toContain("requireZoeAiBillingOperationId");
  });

});
