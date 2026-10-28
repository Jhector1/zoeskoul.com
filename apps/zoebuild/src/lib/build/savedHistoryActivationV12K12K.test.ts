import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = source("../../app/api/build/projects/[buildProjectId]/source-history/route.ts");
const writer = source("./restoreSavedReactVersion.ts");
const view = source("../../app/[locale]/projects/[buildProjectId]/ProjectRevisionHistory.tsx");
const create = source("./createBuildProject.ts");
const apply = source("./applyBuildProjectPlan.ts");
const shell = source("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const bootstrap = source("../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts");

describe("V12K12K saved version switching and dated history", () => {
  it("activates persisted workspace/settings without duplicating saved history", () => {
    expect(writer).toContain("workspace = parseBuildWorkspaceMutation(previous.snapshot)");
    expect(writer).toContain("settings: json(savedSettings)");
    expect(writer).toContain("createRevision: false");
    expect(writer).not.toContain("revisionNote: `ZoeBuild restored source v${args.restoreVersion}`");
    expect(writer).toContain("restoredFromVersion: args.restoreVersion");
    expect(writer).toContain("return {sourceVersion: saved.version");
  });
  it("keeps commerce history, providers and published sites out of the version switch", () => {
    expect(writer).not.toContain("commerceOrder.delete");
    expect(writer).not.toContain("providerConnections.delete");
    expect(writer).not.toContain("deployment.delete");
    expect(writer).toContain("Boolean(specification.requirements.commerce) !== Boolean(current.commerceStore)");
  });
  it("captures full specification in future source snapshots", () => {
    expect(create).toContain("projectSpecification: input.specification");
    expect(apply).toContain("projectSpecification:");
    expect(writer).toContain("projectSpecification");
  });
  it("allows paged history navigation down to version one", () => {
    expect(route).toContain("beforeVersion");
    expect(route).toContain("version: {lt: Number(before)}");
    expect(view).toContain("Load older versions");
    expect(view).toContain("groupRevisionsByDate(revisions)");
    expect(view).toContain("<details key={group.key}");
    expect(view).toContain("Switch to version");
  });
});
