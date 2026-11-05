import { describe, expect, it } from "vitest";
import type { BuildDesignSpecification, ProjectSpecification } from "@zoeskoul/build-contracts";
import { requireBuildTemplate } from "@zoeskoul/build-template-registry";
import { applyBuildDesignToTemplate, materializeRegisteredBuildProject } from "./index";

const design: BuildDesignSpecification = {
  version: 1,
  style: "luxury",
  palette: {
    surface: "#FAF7F2",
    surfaceSoft: "#EFE8DE",
    text: "#171411",
    muted: "#746C63",
    border: "#DDD3C7",
    accent: "#55392A",
    accentContrast: "#FFFFFF",
    artStart: "#DCC6B5",
    artEnd: "#7D5947",
  },
  layout: {
    hero: "editorial",
    productDensity: "airy",
    cardTreatment: "minimal",
  },
  content: {
    brandName: "Maison Zoe",
    eyebrow: "Autumn collection",
    heroTitle: "Quiet luxury for everyday life.",
    heroBody: "A refined collection chosen for texture, proportion, and lasting character.",
    heroCta: "Shop collection",
    featuredHeading: "Selected pieces",
    storyHeading: "Made to stay with you.",
    storyBody: "Thoughtful pieces shaped by quality, restraint, and useful beauty.",
  },
};

const specification: ProjectSpecification = {
  version: 1,
  name: "Maison Zoe",
  projectType: "fullstack-app",
  targets: ["web"],
  requirements: {
    backend: true,
    database: false,
    auth: false,
    storage: false,
    payments: true,
    email: false,
    commerce: true,
  },
  pages: ["Home", "Shop", "Cart"],
  stackId: "tanstack-start-v1",
  commerce: { storefrontRuntime: "tanstack-start" },
  design,
  deployment: { preference: "managed-runtime" },
};

describe("TanStack commerce materialization and design boundary", () => {
  it("does not rewrite canonical server routes with retired static storefront design surfaces", () => {
    const template = requireBuildTemplate("tanstack-start-v1");
    const prepared = applyBuildDesignToTemplate(specification, template);
    // The legacy static storefront design adapter must not corrupt the SSR template.
    // TanStack design customization is handled by the separate reviewed source-edit path.
    expect(prepared).toEqual(template);
    expect(prepared.files.some((file) => file.path.startsWith("src/design/"))).toBe(false);
    expect(prepared.files.some((file) => file.path === "src/server/siteInfo.server.ts")).toBe(true);
  });

  it("creates a valid TanStack workspace without static commerce bridge or provider secrets", () => {
    const result = materializeRegisteredBuildProject({ specification, createdAt: 1 });
    const files = new Map(result.workspace.nodes.filter((node) => node.kind === "file")
      .map((node) => [node.id, node.content ?? ""]));
    expect(result.stackId).toBe("tanstack-start-v1");
    expect(files.has("src/routes/index.tsx")).toBe(true);
    expect(files.has("src/routes/__root.tsx")).toBe(true);
    expect(files.has("src/server/siteInfo.server.ts")).toBe(true);
    expect(files.has("src/commerce/provider.js")).toBe(false);
    expect(JSON.stringify(result.workspace).toLowerCase()).not.toContain("myshopify.com");
  });
});
