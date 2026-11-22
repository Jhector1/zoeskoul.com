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
    // TanStack Start is full-stack capable, but a new blank project must
    // not silently require a backend or database before the user requests one.
    expect(specification.requirements.backend).toBe(false);
    expect(specification.requirements.database).toBe(false);
    expect(specification.requirements.commerce).toBe(false);
  });
  it("produces fresh specifications and rejects blank names", () => {
    expect(createStarterProjectSpecification("A")).not.toBe(createStarterProjectSpecification("A"));
    expect(() => createStarterProjectSpecification("   ")).toThrow("Project name is required");
  });
});
