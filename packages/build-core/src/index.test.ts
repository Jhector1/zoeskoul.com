import { describe, expect, it } from "vitest";
import type {
  BuildRequirements,
  BuildStackDefinition,
} from "@zoeskoul/build-contracts";
import {
  evaluateStackCompatibility,
  selectFirstCompatibleStack,
  unsupportedCapabilities,
} from "./index";

const noManagedCapabilities: BuildRequirements = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
};

const staticStack: BuildStackDefinition = {
  id: "static-html-v1",
  projectTypes: ["static-site"],
  targets: ["web"],
  runtimeProfileId: "build-static-v1",
  templateId: "static-html-v1",
  commands: { build: [] },
  preview: { type: "static" },
  supportedCapabilities: [],
  deploymentAdapterId: "static-assets-v1",
};

const reactStack: BuildStackDefinition = {
  id: "react-vite-v1",
  projectTypes: ["static-site", "frontend-app"],
  targets: ["web"],
  runtimeProfileId: "build-node-v1",
  templateId: "react-vite-v1",
  commands: { build: ["pnpm", "build"] },
  preview: { type: "server", port: 5173 },
  supportedCapabilities: [],
  deploymentAdapterId: "static-assets-v1",
};

describe("build core", () => {
  it("accepts a compatible static stack", () => {
    expect(
      evaluateStackCompatibility(
        {
          projectType: "static-site",
          targets: ["web"],
          requirements: noManagedCapabilities,
        },
        staticStack,
      ),
    ).toEqual({ compatible: true, issues: [] });
  });

  it("selects deterministically from registry order", () => {
    const selected = selectFirstCompatibleStack(
      {
        projectType: "frontend-app",
        targets: ["web"],
        requirements: noManagedCapabilities,
      },
      [staticStack, reactStack],
    );

    expect(selected?.id).toBe("react-vite-v1");
  });

  it("fails closed when managed capabilities have no supported stack", () => {
    const requirements: BuildRequirements = {
      ...noManagedCapabilities,
      backend: true,
      database: true,
    };

    expect(
      selectFirstCompatibleStack(
        {
          projectType: "fullstack-app",
          targets: ["web"],
          requirements,
        },
        [staticStack, reactStack],
      ),
    ).toBeNull();

    expect(unsupportedCapabilities({ requirements }, reactStack)).toEqual([
      "backend",
      "database",
    ]);
  });
});
