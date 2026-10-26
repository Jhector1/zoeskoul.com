import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { selectZoeAssistantSourceEvidence } from "./zoeAssistantSourceEvidence";

const workspace = (files: Record<string,string>): WorkspaceStateV2 => ({
  version: 2, language: "html", activeFileId: "id-0",
  nodes: Object.entries(files).map(([name, content], index) => ({
    id: `id-${index}`, kind: "file" as const, name, parentId: null,
    content, createdAt: 1, updatedAt: 1,
  })),
} as unknown as WorkspaceStateV2);

describe("E17B owner-authorized project source evidence", () => {
  it("includes the focused editable file, with explicit partial-source bounds", () => {
    const result = selectZoeAssistantSourceEvidence(workspace({
      "App.tsx": "export default function App(){return <main>Tasks</main>}",
      "style.css": "body { margin: 0 }",
    }), "App.tsx");
    expect(result.files[0]?.path).toBe("App.tsx");
    expect(result.files[0]?.excerpt).toContain("Tasks");
    expect(result.scope).toBe("partial-source-excerpts");
    expect(result.omittedFiles).toBe(0);
  });
  it("truncates oversized excerpts and never copies every file", () => {
    const input = Object.fromEntries(Array.from({length: 9}, (_, i) => [`file${i}.tsx`, "x".repeat(10_000)]));
    const result = selectZoeAssistantSourceEvidence(workspace(input), "file0.tsx");
    expect(result.files.length).toBeLessThanOrEqual(4);
    expect(result.files.reduce((sum, f) => sum + f.excerpt.length, 0)).toBeLessThanOrEqual(7_200);
    expect(result.files.every(f => f.truncated)).toBe(true);
    expect(result.omittedFiles).toBeGreaterThan(0);
  });
  it("exposes bounded route-relevant path names without claiming route execution",()=>{
    const result=selectZoeAssistantSourceEvidence(workspace({
      "src/App.tsx":"export const App = ()=>null;",
      "src/routes/approach.tsx":"export default function Approach(){return null}",
      "src/components/Hero.tsx":"export const Hero = 1;",
      "package.json":"{\"dependencies\":{\"react-router\":\"^7.0.0\"}}",
      ".env":"not visible",
    }),"src/App.tsx");
    expect(result.routeRelevantPaths).toContain("src/routes/approach.tsx");
    expect(result.routeRelevantPaths).toContain("src/App.tsx");
    expect(result.routeRelevantPaths).not.toContain(".env");
    expect(JSON.stringify(result.routeRelevantPaths)).not.toContain("export const Hero");
  });
  it("resolves canonical nested route paths without disclosing blocked files",()=>{
    const nested = {
      ...workspace({"index.html":"<main>Home</main>"}),
      nodes: [
        {id:"folder-src",kind:"folder",name:"src",parentId:null,createdAt:1,updatedAt:1},
        {id:"folder-routes",kind:"folder",name:"routes",parentId:"folder-src",createdAt:1,updatedAt:1},
        {id:"route-approach",kind:"file",name:"approach.tsx",parentId:"folder-routes",
          content:"export default function Approach(){return null}",createdAt:1,updatedAt:1},
        {id:"folder-secret",kind:"folder",name:".private",parentId:"folder-src",createdAt:1,updatedAt:1},
        {id:"hidden",kind:"file",name:"routes.tsx",parentId:"folder-secret",
          content:"sensitive content",createdAt:1,updatedAt:1},
      ],
      activeFileId:"route-approach",
    } as unknown as WorkspaceStateV2;
    const result=selectZoeAssistantSourceEvidence(nested,"src/routes/approach.tsx");
    expect(result.routeRelevantPaths).toContain("src/routes/approach.tsx");
    expect(result.routeRelevantPaths.every(path=>!path.includes(".private"))).toBe(true);
    expect(result.routeRelevantPaths.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(result.routeRelevantPaths)).not.toContain("sensitive content");
  });
  it("never includes dotfiles, uneditable code paths, or credential-bearing excerpts", () => {
    const secret = "sk-proj-" + "a".repeat(20);
    const result = selectZoeAssistantSourceEvidence(workspace({
      ".env": `API_KEY=${secret}`,
      "private.css": `/* ${secret} */`,
      "index.html": "<h1>Welcome</h1>",
      "server.ts": "const unsafe = true",
    }), "index.html");
    expect(result.files.map(f => f.path)).toEqual(["index.html"]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
