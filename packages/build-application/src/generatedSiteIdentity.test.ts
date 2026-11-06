import { describe, expect, it, vi } from "vitest";
import { parseProjectSpecification } from "@zoeskoul/build-contracts";
import {
  createBuildProject,
  type BuildSourceSavePersistenceInput,
  type InitialBuildProjectPersistenceInput,
} from "./index";

const base = {
  version: 1,
  name: "Blue Gallery",
  projectType: "fullstack-app",
  targets: ["web"],
  pages: ["Home", "About"],
  stackId: "tanstack-start-v1",
  requirements: {
    backend: true, database: false, auth: false, storage: false,
    payments: false, email: false, commerce: false,
  },
  deployment: { preference: "managed-runtime" },
} as const;

function capture() {
  let saved: InitialBuildProjectPersistenceInput | undefined;
  const persistence = {
    createInitialBuildProject: vi.fn(async (input: InitialBuildProjectPersistenceInput) => {
      saved = input;
      return { codeProjectId: "code", buildProjectId: "build", sourceVersion: 1 };
    }),
  };
  return { persistence, getSaved: () => saved };
}

function file(input: InitialBuildProjectPersistenceInput, path: string) {
  const node = input.workspace.nodes.find((candidate) => candidate.id === path);
  if (!node || node.kind !== "file") throw new Error(`Missing file: ${path}`);
  return node.content;
}

describe("new project site identity", () => {
  it("uses the real project name in one shared site data source", async () => {
    const { persistence, getSaved } = capture();
    await createBuildProject({
      ownerId: "owner", createdAt: 100,
      specification: parseProjectSpecification(base), persistence,
    });
    const saved = getSaved();
    expect(saved).toBeDefined();
    if (!saved) return;
    expect(saved.title).toBe("Blue Gallery");
    expect(file(saved, "src/data/site.ts")).toContain('name: "Blue Gallery"');
    expect(file(saved, "src/data/site.ts")).toContain('tagline: "Welcome to Blue Gallery"');
    expect(file(saved, "src/data/site.ts")).not.toContain("Zoé Build");
    expect(file(saved, "src/components/SiteHeader.tsx")).toContain("{site.name}");
    expect(file(saved, "src/components/SiteFooter.tsx")).toContain("{site.name}");
    expect(file(saved, "src/routes/__root.tsx")).toContain("title: site.name");
    expect(file(saved, "src/routes/index.tsx")).toContain("`${site.name} | Home`");
    expect(file(saved, "src/routes/about.tsx")).toContain("`About | ${site.name}`");
    expect(file(saved, "src/routes/about.tsx")).toContain("About {site.name}");
    expect(file(saved, "src/routes/index.tsx")).toContain('to="/about"');
    expect(file(saved, "src/routes/index.tsx")).toContain("createFileRoute");
    expect(file(saved, "src/routes/about.tsx")).toContain("createFileRoute");
    expect(file(saved, "src/components/SiteHeader.tsx")).toContain('to="/"');
    for (const path of [
      "src/data/site.ts",
      "src/components/SiteHeader.tsx",
      "src/components/SiteFooter.tsx",
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/routes/about.tsx",
    ]) {
      expect(file(saved, path)).not.toMatch(/Zo[eé] Build|Built with Zo[eé]/i);
    }
  });

  it("serializes a name with quotes safely into TypeScript source", async () => {
    const { persistence, getSaved } = capture();
    const name = 'Artist "Studio"\\n</script>  & Co.';
    await createBuildProject({
      ownerId: "owner", createdAt: 101,
      specification: parseProjectSpecification({ ...base, name }), persistence,
    });
    const saved = getSaved();
    expect(saved).toBeDefined();
    if (!saved) return;
    expect(file(saved, "src/data/site.ts")).toContain(
      `name: ${JSON.stringify(name)}`,
    );
    expect(file(saved, "src/data/site.ts")).toContain(
      `tagline: ${JSON.stringify(`Welcome to ${name}`)}`,
    );
  });

  it("does not rewrite source when an existing project is saved", async () => {
    const existingSite = {
      version: 2 as const,
      language: "web" as const,
      nodes: [{
        id: "src/data/site.ts",
        kind: "file" as const,
        name: "site.ts",
        parentId: null,
        content: 'export const site = { name: "Existing customer identity" };',
        createdAt: 1,
        updatedAt: 2,
      }],
      openTabs: ["src/data/site.ts"],
      activeFileId: "src/data/site.ts",
      entryFileId: "src/data/site.ts",
      stdin: "",
      expanded: [],
      leftPct: 26,
    };
    const saveOwnedBuildProjectSource = vi.fn(async (_input: BuildSourceSavePersistenceInput) => ({
      sourceVersion: 9,
      changed: true,
      workspaceChanged: true,
      updatedAt: "2026-11-06T00:00:00.000Z",
    }));
    const { saveBuildProjectSourceCommand } = await import("./index");
    await saveBuildProjectSourceCommand({
      access: { userId: "owner", entitlements: [] },
      buildProjectId: "build_existing",
      baseVersion: 8,
      workspace: existingSite,
      writer: { saveOwnedBuildProjectSource },
    });
    expect(saveOwnedBuildProjectSource).toHaveBeenCalledWith(expect.objectContaining({
      workspace: existingSite,
    }));
    const persistedSite = saveOwnedBuildProjectSource.mock.calls[0]?.[0].workspace.nodes
      .find((node) => node.id === "src/data/site.ts");
    expect(persistedSite?.kind).toBe("file");
    if (!persistedSite || persistedSite.kind !== "file") return;
    expect(persistedSite.content).toContain("Existing customer identity");
  });

  it("keeps the canonical template neutral for direct materialization", async () => {
    const { persistence, getSaved } = capture();
    await createBuildProject({
      ownerId: "owner", createdAt: 102,
      specification: parseProjectSpecification({ ...base, name: "My Website" }),
      persistence,
    });
    const saved = getSaved();
    expect(saved).toBeDefined();
    if (!saved) return;
    expect(file(saved, "src/data/site.ts")).toContain('name: "My Website"');
    expect(file(saved, "src/routes/index.tsx")).not.toContain("A new standard for building");
    expect(file(saved, "src/components/SiteFooter.tsx")).not.toContain("Built with Zoé");
  });
});
