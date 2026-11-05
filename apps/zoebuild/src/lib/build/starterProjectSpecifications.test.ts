import { describe, expect, it } from "vitest";
import { parseProjectSpecification } from "@zoeskoul/build-application";
import { createStarterProjectSpecification } from "./starterProjectSpecifications";

describe("one canonical new-project specification", () => {
  it("materializes a TanStack Start server-rendered project", () => {
    const specification = parseProjectSpecification(createStarterProjectSpecification(" My app "));
    expect(specification.name).toBe("My app");
    expect(specification.stackId).toBe("tanstack-start-v1");
    expect(specification.projectType).toBe("fullstack-app");
    expect(specification.targets).toEqual(["web"]);
    expect(specification.deployment.preference).toBe("managed-runtime");
    expect(specification.requirements.backend).toBe(true);
    expect(specification.requirements.commerce).toBe(false);
  });
  it("produces fresh specifications and rejects blank names", () => {
    expect(createStarterProjectSpecification("A")).not.toBe(createStarterProjectSpecification("A"));
    expect(() => createStarterProjectSpecification("   ")).toThrow("Project name is required");
  });
});
