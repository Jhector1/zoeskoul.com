import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./SandboxBoardClient.tsx", import.meta.url), "utf8");
const drawingEngine = readFileSync(new URL("../../../../../../components/tools/panes/BoardToolPane.tsx", import.meta.url), "utf8");

describe("sandbox whiteboard immersive viewport", () => {
  it("occupies the dynamic viewport instead of the constrained sandbox page container", () => {
    expect(page).toContain('data-sandbox-board-immersive');
    expect(page).toContain('height: "100dvh"');
    expect(page).toContain('h-screen min-h-0 w-full flex-col');
    expect(page).toContain('min-h-0 flex-1 overflow-hidden');
    expect(page).not.toContain('ui-container');
    expect(page).toContain('href={`/${locale}/sandbox`}');
  });
  it("gives the existing drawing engine a definite full-height flex chain", () => {
    expect(client).toContain('h-full min-h-0 w-full overflow-hidden');
    expect(client).toContain('<Board boardKey={boardKey}/>');
    expect(drawingEngine).toContain('flex h-full min-h-0 flex-col');
    expect(drawingEngine).toContain('relative min-h-0 flex-1');
  });
  it("preserves the same personal saved-document identity", () => {
    for (const token of ['subjectSlug: "sandbox"','moduleId: "standalone"','toolId: "board"','scopeKey: "personal"']) {
      expect(client).toContain(token);
    }
  });
});
