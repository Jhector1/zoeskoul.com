import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild semantic planning ownership", () => {
  it("sends model output through the canonical validator without pre-classifying the user", () => {
    const owner = source("./costAwareZoeBuildPlanning.ts");
    expect(owner).not.toContain("classify" + "BuildRequest");
    expect(owner).not.toContain("lock" + "Architecture");
    expect(owner).toContain("planBuildProjectFromPrompt({");
    expect(owner).toContain("profileFromValidatedSpecification(plan.specification)");
    expect(owner).not.toContain("profile.requirements");
  });
  it("preserves manual models and the independent required billing gate", () => {
    const owner = source("./costAwareZoeBuildPlanning.ts");
    expect(owner).toContain("ZOEBUILD_AI_ROUTING_MODE");
    expect(owner).toContain('mode === "manual"');
    expect(owner).toContain("resolveBuildModelRoute");
    expect(owner).toContain("BUILD_AI_CREDITS_METERING_REQUIRED");
    expect(owner).toContain("createMeteredZoeBuildAttemptPlanner");
  });
  it("does not retry an incompatible architecture hoping a model drops a requirement", () => {
    const owner = source("./costAwareZoeBuildPlanning.ts");
    expect(owner).toContain("isRetryableProviderFailure");
    expect(owner).toContain('"BUILD_AI_SPEC_INVALID"');
    expect(owner).not.toContain('"BUILD_AI_STACK_INCOMPATIBLE"');
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { planCostAwareZoeBuildProject } from "./costAwareZoeBuildPlanning";
import { createZoeBuildAiPlannerFromConfig } from "./createZoeBuildAiPlanner";

vi.mock("./createZoeBuildAiPlanner", () => ({
  createZoeBuildAiPlannerFromConfig: vi.fn(),
  resolveZoeBuildAiConfig: vi.fn(() => ({provider: "claude", model: "configured-model"})),
  ZoeBuildAiConfigurationError: class extends Error {},
}));
const base = {
  version: 1, name: "Simulation", projectType: "fullstack-app", targets: ["web"],
  requirements: {backend: false, database: false, auth: false, storage: false, payments: false, email: false, commerce: false},
  pages: ["Play"], stackId: "tanstack-start-v1", deployment: {preference: "managed-runtime"},
} as const;
const createPlanner = vi.mocked(createZoeBuildAiPlannerFromConfig);

beforeEach(() => {
  vi.stubEnv("ZOEBUILD_AI_ROUTING_MODE", "auto");
  vi.stubEnv("ZOEBUILD_AI_CREDITS_ENFORCEMENT", "");
  vi.stubEnv("OPENAI_API_KEY", "test-credential");
  vi.stubEnv("GEMINI_API_KEY", "test-credential");
  createPlanner.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

function respond(specification: unknown = base) {
  const generateProjectSpecification = vi.fn(async () => ({specification, metadata: {provider: "test", model: "test"}}));
  createPlanner.mockReturnValue({generateProjectSpecification});
  return generateProjectSpecification;
}

describe("model-led architecture behavior", () => {
  it.each([
    "Make a game about a marketplace with no real commerce, login, or database.",
    "Construis un jeu de réservation fictif, sans paiement.",
    "Build a calculator.",
    "Make a unique interactive application.",
  ])("passes the user's request unclassified to the model: %s", async prompt => {
    const generate = respond();
    const result = await planCostAwareZoeBuildProject({prompt});
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith({prompt, media: [], maxOutputTokens: undefined});
    expect(result.plan.specification).toEqual(base);
    expect(result.routing.profile.requirements).toEqual(base.requirements);
    expect(createPlanner).toHaveBeenCalledWith({provider: "openai", model: "gpt-6.1-sol"});
  });
  it("does not silently downgrade missing runtime capabilities or retry them", async () => {
    const generate = respond({...base, requirements: {...base.requirements, database: true}});
    await expect(planCostAwareZoeBuildProject({prompt: "Use persistent records."})).rejects.toMatchObject({code: "BUILD_AI_STACK_INCOMPATIBLE"});
    expect(generate).toHaveBeenCalledTimes(1);
    expect(createPlanner).toHaveBeenCalledTimes(1);
  });
  it("requires existing metering in enforced mode", async () => {
    vi.stubEnv("ZOEBUILD_AI_CREDITS_ENFORCEMENT", "required");
    const generate = respond();
    await expect(planCostAwareZoeBuildProject({prompt: "Build anything"})).rejects.toThrow("BUILD_AI_CREDITS_METERING_REQUIRED");
    expect(generate).not.toHaveBeenCalled();
    expect(createPlanner).not.toHaveBeenCalled();
  });
  it("honors the explicit manual provider and model", async () => {
    vi.stubEnv("ZOEBUILD_AI_ROUTING_MODE", "manual");
    respond();
    await planCostAwareZoeBuildProject({prompt: "Build anything"});
    expect(createPlanner).toHaveBeenCalledWith({provider: "claude", model: "configured-model"});
  });
  it("retries invalid model output with another configured model", async () => {
    createPlanner.mockReturnValueOnce({generateProjectSpecification: vi.fn(async () => ({specification: {}, metadata: {provider: "test", model: "test"}}))});
    respond();
    const result = await planCostAwareZoeBuildProject({prompt: "Build an application"});
    expect(result.routing.attempts.map(a => a.outcome)).toEqual(["validation-failed", "success"]);
    expect(createPlanner).toHaveBeenCalledTimes(2);
  });
});
