import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { createZoeProjectFileTools, ZoeProjectFileToolError } from "./zoeProjectFileTools";

function fixture(files: Record<string, string>): WorkspaceStateV2 {
  const nodes: Record<string, unknown>[] = [];
  const folders = new Map<string, string>();
  for (const [path, content] of Object.entries(files)) {
    let parentId: string | null = null;
    const segments = path.split("/");
    for (let i = 0; i < segments.length - 1; i++) {
      const folderPath = segments.slice(0, i + 1).join("/");
      if (!folders.has(folderPath)) {
        const id = `folder:${folderPath}`;
        nodes.push({id,kind:"folder",name:segments[i],parentId,createdAt:1,updatedAt:1});
        folders.set(folderPath,id);
      }
      parentId = folders.get(folderPath)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:segments.at(-1),parentId,
      content,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes,openTabs:[],activeFileId:null,entryFileId:null,
    stdin:"",expanded:[],leftPct:25} as unknown as WorkspaceStateV2;
}

describe("V12K10 snapshot-scoped project inspection", () => {
  it("indexes every eligible source file without the previous fixed 120-file cutoff", () => {
    const files = Object.fromEntries(Array.from({length:260},(_,i) =>
      [`src/pages/page${String(i).padStart(3,"0")}.tsx`,`export default function Page(){return <main>${i}</main>}`]));
    const tools = createZoeProjectFileTools(fixture(files));
    expect(tools.count).toBe(260);
    const all: string[] = [];
    let offset = 0;
    while (true) {
      const page = tools.list({offset,limit:37});
      all.push(...page.entries.map(file => file.path));
      if (page.nextOffset === null) break;
      offset = page.nextOffset;
    }
    expect(all).toHaveLength(260);
    expect(new Set(all).size).toBe(260);
  });
  it("reads complete large source over multiple calls, including beyond old file/context caps", () => {
    const content = "section content\n".repeat(13_000);
    const tools = createZoeProjectFileTools(fixture({"src/pages/studio.tsx":content}));
    const pieces: string[] = [];
    let offset = 0;
    let expectedHash = "";
    do {
      const part = tools.read("src/pages/studio.tsx", {offset,length:17_000});
      pieces.push(part.content);
      if (expectedHash) expect(part.sha256).toBe(expectedHash);
      expectedHash = part.sha256;
      if (part.nextOffset === null) break;
      offset = part.nextOffset;
    } while (true);
    expect(pieces.join("")).toBe(content);
    expect(tools.count).toBe(1);
  });
  it("searches all source files with deterministic paginated literal results", () => {
    const tools = createZoeProjectFileTools(fixture({
      "src/App.tsx":"import Shell from './components/Shell';\n<header>Shared</header>",
      "src/components/Shell.tsx":"export default function Shell(){return <header>Shared</header>}",
      "src/pages/contact.tsx":"export default function Contact(){return <header>Shared</header>}",
    }));
    expect(tools.list().entries[0]?.imports).toContain("./components/Shell");
    const first = tools.search("<header>", {limit:1});
    expect(first.hits).toHaveLength(1);
    expect(first.nextOffset).not.toBeNull();
    const next = tools.search("<header>", {limit:3,offset:first.nextOffset!});
    expect(first.hits.concat(next.hits)).toHaveLength(3);
  });
  it("never exposes protected files, binary content or credential-bearing text", () => {
    const workspace = fixture({
      "src/App.tsx":"export default function App(){return null}",
      ".env.local":"DATABASE_URL=private",
      "src/components/secret.tsx":"const key = 'sk_live_abcdefghijklmnopqrst';",
      "node_modules/pkg/index.js":"irrelevant",
      "src/components/../steal.tsx":"unsafe",
      "package.json":"{\"scripts\":{\"build\":\"vite build\"}}",
    });
    (workspace.nodes as unknown as Record<string, unknown>[]).push({id:"binary:1",kind:"file",name:"photo.png",parentId:null,
      binary:true,content:{base64:"xxxx"},createdAt:1,updatedAt:1});
    const tools = createZoeProjectFileTools(workspace);
    expect(tools.list().entries.map(f => f.path)).toEqual(["package.json","src/App.tsx"]);
    for (const path of [".env.local","src/components/secret.tsx","src/components/../steal.tsx","node_modules/pkg/index.js"]) {
      expect(() => tools.read(path)).toThrow(ZoeProjectFileToolError);
    }
  });
  it("rejects unbounded or invalid tool inputs", () => {
    const tools = createZoeProjectFileTools(fixture({"src/App.tsx":"short"}));
    expect(() => tools.list({limit:10000})).toThrow(ZoeProjectFileToolError);
    expect(() => tools.read("src/App.tsx",{offset:-1})).toThrow(ZoeProjectFileToolError);
    expect(() => tools.read("src/App.tsx",{length:1000000})).toThrow(ZoeProjectFileToolError);
    expect(() => tools.search("\n")).toThrow(ZoeProjectFileToolError);
    expect(() => tools.search("hello",{prefix:"../"})).toThrow(ZoeProjectFileToolError);
  });
  it("only reads the frozen workspace snapshot; caller mutations do not leak into it", () => {
    const ws=fixture({"src/App.tsx":"original"});
    const tools=createZoeProjectFileTools(ws);
    const file=ws.nodes.find(n => n.kind==="file");
    if (file?.kind==="file") (file as {content:string}).content="changed";
    expect(tools.read("src/App.tsx").content).toBe("original");
  });
});
