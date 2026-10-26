import {describe,expect,it} from "vitest";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
const shell = fs.readFileSync(fileURLToPath(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",import.meta.url)), "utf8");
const classifier = fs.readFileSync(fileURLToPath(new URL("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts",import.meta.url)), "utf8");
const edit = fs.readFileSync(fileURLToPath(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",import.meta.url)), "utf8");

describe("Zoe semantic orchestration ownership",()=>{
  it("uses model classification instead of regex gates to decide actions",()=>{
    expect(shell).not.toContain("isZoeSourceEditInstruction");
    expect(shell).not.toContain("isExplicitFullRebuildIntent");
    expect(classifier).toContain("generateJsonText");
    expect(classifier).toContain("latest instruction controls");
    expect(shell).toContain("previousAssistantInstructions.current");
  });
  it("never trusts natural-language classification to authorize edits",()=>{
    expect(classifier).toContain("getBuildProjectCommand");
    expect(classifier).toContain("enforceSameOriginPost");
    expect(classifier).toContain("rateLimit");
    expect(edit).toContain("resolveBuildAccess(access).canEditWithAi");
    expect(edit).toContain("isZoeStaticPagePath(body.pagePath)");
    expect(edit).toContain("saveBuildProjectSourceCommand");
  });
});
