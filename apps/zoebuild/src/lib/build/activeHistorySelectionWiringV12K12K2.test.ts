import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const read = (path:string) => readFileSync(new URL(path,import.meta.url),"utf8");
const route=read("../../app/api/build/projects/[buildProjectId]/source-history/route.ts");
const panel=read("../../app/[locale]/projects/[buildProjectId]/ProjectRevisionHistory.tsx");
const writer=read("./restoreSavedReactVersion.ts");

describe("V12K12K2 active history selection wiring", () => {
  it("returns the selected history version separately from the CAS head", () => {
    expect(route).toContain("activeVersion = activeSavedHistoryVersion(");
    expect(route).toContain("currentVersion:currentSource.currentVersion, activeVersion");
    expect(route).toContain("restoredFromVersion:restore.restoreVersion,activeVersion:restore.restoreVersion");
  });
  it("does not confuse restored source head with selected version in UI", () => {
    expect(panel).toContain("setActiveVersion(Number.isSafeInteger(payload.activeVersion)");
    expect(panel).toContain("revision.version===activeVersion");
    expect(panel).toContain("revision.version !== activeVersion");
    expect(panel).not.toContain("revision.version===props.currentVersion ?");
    expect(panel).toContain("version === activeVersion");
  });
  it("switches identical snapshots without fabricating an incomplete revision", () => {
    expect(writer).toContain("const sameSource =");
    expect(writer).toContain("tx.codeProject.updateMany({");
    expect(writer).toContain("activeHistoryVersion: args.restoreVersion");
    expect(writer).toContain("activeHistorySourceVersion: args.expectedVersion");
    expect(writer).toContain("activeHistorySourceVersion: args.expectedVersion + 1");
    expect(writer).toContain("return {sourceVersion: args.expectedVersion, changed: false");
  });
});
