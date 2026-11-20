import { describe, expect, it } from "vitest";
import { profileFromValidatedSpecification, resolveBuildModelRoute } from "./index";
import type { ProjectSpecification } from "@zoeskoul/build-contracts";

const spec: ProjectSpecification = {
  version: 1, name: "Arbitrary project", projectType: "fullstack-app", targets: ["web"],
  requirements: {backend: false, database: false, auth: false, storage: false, payments: false, email: false, commerce: false},
  pages: ["Play"], stackId: "tanstack-start-v1", deployment: {preference: "managed-runtime"},
};

describe("prompt-independent ZoeBuild model routing", () => {
  it("prefers a strong model for text or images without classifying the application", () => {
    for (const kinds of [[], ["image"]] as const) {
      const route = resolveBuildModelRoute(kinds);
      expect(route.strategy).toBe("quality-first");
      expect(route.candidates[0]).toMatchObject({provider: "openai", model: "gpt-6.1-sol"});
    }
  });
  it("chooses native audiovisual transport without inspecting prompt words", () => {
    for (const kinds of [["audio"], ["video", "image"]] as const) {
      const route = resolveBuildModelRoute(kinds);
      expect(route.candidates.every(candidate => candidate.provider === "gemini")).toBe(true);
      expect(route.candidates[0]?.model).toBe("gemini-3.8-flash");
    }
  });
  it("retains existing ordinary paid model priorities without certifying them", () => {
    expect(resolveBuildModelRoute([], {billingEnforced: true}).candidates.map(c => c.model))
      .toEqual(["gpt-6-luna", "gemini-3.1-flash-lite", "gpt-6.1-sol"]);
  });
  it("reports model architecture rather than guessing an application category", () => {
    expect(profileFromValidatedSpecification(spec)).toEqual({projectType: spec.projectType,
      targets: spec.targets, requirements: spec.requirements, commerce: null, stackId: spec.stackId,
      deploymentPreference: spec.deployment.preference});
    const catalog: ProjectSpecification = {...spec, requirements: {...spec.requirements, commerce: true},
      commerce: {storefrontRuntime: "tanstack-start"}};
    expect(profileFromValidatedSpecification(catalog).requirements.payments).toBe(false);
    expect(profileFromValidatedSpecification(catalog).commerce).toEqual(catalog.commerce);
  });
});
