import { describe, expect, it } from "vitest";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { applyZoeEditsToWorkspace, sha256, validateZoeEdits } from "./zoeTargetedSourceEdit";
import { renderZoeReactRouter, wireZoeReactEntry, ZOE_REACT_ROUTER_MARKER } from "./zoeReactRouteEdits";

function project(): WorkspaceStateV2 {
  const file = (id: string, name: string, parentId: string, content: string) =>
    ({ id, kind: "file" as const, name, parentId, content, createdAt: 1, updatedAt: 1 });
  const folder = (id: string, name: string, parentId: string) =>
    ({ id, kind: "folder" as const, name, parentId, createdAt: 1, updatedAt: 1 });
  const main = 'import { BrowserRouter } from "react-router"; import { AppRoutes } from "./routes/AppRoutes"; const root = <BrowserRouter><AppRoutes /></BrowserRouter>;' ;
  return { version: 2, language: "web", leftPct: 26, stdin: "", expanded: ["src"], openTabs: ["app"], entryFileId: "main", activeFileId: "app", nodes: [
    folder("src", "src", ""), folder("routes", "routes", "src"),
    file("main", "main.tsx", "src", main),
    file("app", "App.tsx", "src", "export default function App(){return <main>Home</main>}"),
    file("routesFile", "AppRoutes.tsx", "routes", renderZoeReactRouter(["about"])),
    file("html", "index.html", "", '<div id="root"></div>'),
  ].map(node => ({ ...node, parentId: node.parentId || null })) } as WorkspaceStateV2;
}

describe("V12K11P React Router site architecture", () => {
  it("generates standard Routes/Route and never reinvents click/history handlers", () => {
    const source = renderZoeReactRouter(["about", "studio", "about"]);
    expect(source).toContain(ZOE_REACT_ROUTER_MARKER);
    expect(source).toContain('<Route path="about" element={<Page0 />} />');
    expect(source).toContain('<Route path="studio" element={<Page1 />} />');
    expect(source).toContain('<SiteLayout />');
    expect(source).not.toContain("MutationObserver");
    expect(source).not.toContain("history.pushState");
    expect(renderZoeReactRouter([], false)).not.toContain("SiteLayout");
  });
  it("accepts only the modern router bootstrap rather than silently rewriting old ones", () => {
    const main = project().nodes.find(node => node.id === "main");
    expect(main?.kind === "file" && wireZoeReactEntry(main.content)).toBeTruthy();
    expect(() => wireZoeReactEntry('import ZoePages from "./ZoePages"')).toThrow();
  });
  it("atomically creates folders for hooks, data and layouts without permitting dependency files", () => {
    const workspace = project();
    const edits = [
      { path: "src/hooks/useTheme.ts", content: "export function useTheme(){ return 'light'; }", beforeSha256: sha256(""), create: true as const },
      { path: "src/data/sections.json", content: '{"sections":["About"]}', beforeSha256: sha256(""), create: true as const },
      { path: "src/layouts/Layout.tsx", content: "export default function Layout(){return <main />}", beforeSha256: sha256(""), create: true as const },
    ];
    expect(validateZoeEdits(workspace, edits)).toHaveLength(3);
    const applied = applyZoeEditsToWorkspace(workspace, edits);
    expect(applied.nodes.filter(node => node.kind === "file").map(node => pathOf(applied.nodes, node.id)))
      .toEqual(expect.arrayContaining(edits.map(e => e.path)));
    for (const path of ["package.json", "pnpm-lock.yaml", "src/../.env", "src/data/../../../hack.ts", "src/secrets/key.ts"]) {
      expect(() => validateZoeEdits(workspace, [{ path, content: "x", beforeSha256: sha256(""), create: true }])).toThrow();
    }
    expect(() => validateZoeEdits(workspace, [{ path: "src/data/invalid.json", content: "{broken", beforeSha256: sha256(""), create: true }])).toThrow();
  });
});
