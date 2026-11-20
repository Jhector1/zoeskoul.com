import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {createStarterProjectSpecification, storeInitialBuildPrompt, takeInitialBuildPrompt, INITIAL_BUILD_PROMPT_MAX_CHARS} from "../../lib/build/starterProjectSpecifications";

const client =
  readFileSync(
    new URL(
      "./CreateBuildProjectClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const page =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const route =
  readFileSync(
    new URL(
      "../../app/api/build/projects/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "ZoeBuild create-project UX",
  () => {
    it(
      "uses the canonical creation API",
      () => {
        expect(client).toContain(
          '"/api/build/projects"',
        );

        expect(client).toContain(
          '"POST"',
        );

        expect(client).toContain(
          '"same-origin"',
        );

        expect(client).toContain(
          "specification: createStarterProjectSpecification(name)",
        );
      },
    );

    it(
      "opens the created project",
      () => {
        expect(client).toContain(
          "buildProjectId",
        );

        expect(client).toContain(
          "router.push(",
        );
      },
    );

    it(
      "creates one TanStack Start project without client-selected legacy archetypes",
      () => {
        expect(client).toContain('createStarterProjectSpecification(name)');
        expect(client).toContain("Start with TanStack Start.");
        expect(client).toContain('Project name');
        expect(client).not.toContain('"react-vite-v1"');
        expect(client).not.toContain('"commerce-static-v1"');
      },
    );

    it(
      "replaces the old placeholder",
      () => {
        expect(page).toContain(
          "<CreateBuildProjectClient locale={locale} />",
        );

        expect(page).toContain(
          "Create your first project",
        );

        expect(page).not.toContain(
          "creation experience comes in a later UI wave",
        );
      },
    );

    it(
      "keeps security on the server boundary",
      () => {
        expect(route).toContain(
          "enforceSameOriginPost(req)",
        );

        expect(route).toContain(
          'bucket: "zoebuild-project-create"',
        );

        expect(route).toContain(
          "parseProjectSpecification(body.specification)",
        );

        expect(route).toContain(
          "createBuildProjectCommand({",
        );
      },
    );
  },
);

function memoryStorage() {
  const entries = new Map<string,string>();
  return {getItem: (key:string) => entries.get(key) ?? null,
    setItem: (key:string,value:string) => {entries.set(key,value);},
    removeItem: (key:string) => {entries.delete(key);}};
}
describe("Open-ended initial prompt handoff", () => {
  it("uses a neutral runtime bootstrap without declared application screens or managed features", () => {
    const spec = createStarterProjectSpecification("  My game  ");
    expect(spec.name).toBe("My game");
    expect(spec.pages).toEqual([]);
    expect(Object.values(spec.requirements as Record<string,boolean>).every(v => v === false)).toBe(true);
    expect(spec.stackId).toBe("tanstack-start-v1");
  });
  it("preserves arbitrary user ideas verbatim apart from outer whitespace and consumes only the named project", () => {
    const store = memoryStorage();
    const idea = "Créer un jeu de boutique, sans paiement.\nUse a canvas.";
    expect(storeInitialBuildPrompt(store,"p1",idea,100)).toBe(true);
    expect(takeInitialBuildPrompt(store,"p2",101)).toBeNull();
    expect(takeInitialBuildPrompt(store,"p1",101)).toBe(idea);
    expect(takeInitialBuildPrompt(store,"p1",102)).toBeNull();
  });
  it("rejects oversized, expired and corrupt drafts, and tolerates unavailable storage", () => {
    const store = memoryStorage();
    expect(storeInitialBuildPrompt(store,"p","x".repeat(INITIAL_BUILD_PROMPT_MAX_CHARS+1),100)).toBe(false);
    expect(storeInitialBuildPrompt(store,"p","idea",100)).toBe(true);
    expect(takeInitialBuildPrompt(store,"p",600100)).toBeNull();
    expect(takeInitialBuildPrompt(store,"p",100)).toBeNull();
    store.setItem("zoebuild:initial-prompt:v1:p","invalid json");
    expect(takeInitialBuildPrompt(store,"p",100)).toBeNull();
    expect(takeInitialBuildPrompt(store,"p",100)).toBeNull();
    const denied = {getItem: () => {throw new Error("denied");}, setItem: () => {throw new Error("denied");}, removeItem: () => {throw new Error("denied");}};
    expect(storeInitialBuildPrompt(denied,"p","idea",100)).toBe(false);
    expect(takeInitialBuildPrompt(denied,"p",100)).toBeNull();
  });
  it("hands the draft to the existing composer, never an automatic AI provider request", () => {
    const composer = readFileSync(new URL("./ZoeBuildPromptComposer.tsx",import.meta.url),"utf8");
    const shell = readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",import.meta.url),"utf8");
    expect(client).toContain("storeInitialBuildPrompt(window.sessionStorage, projectId, idea)");
    expect(client).toContain("createdProjectRef.current = projectId");
    expect(client).not.toContain("/assistant/");
    expect(composer).toContain("takeInitialBuildPrompt(window.sessionStorage, props.initialPromptProjectId)");
    expect(composer).toContain("draftRevisionRef.current !== 0");
    expect(shell).toContain("initialPromptProjectId={props.project.buildProjectId}");
    expect(shell).toContain("onPrompt={planChange}");
    expect(shell).toContain("/assistant/intent");
    expect(shell).toContain("/assistant/edit");
  });
});
