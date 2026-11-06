import { describe, expect, it } from "vitest";
import {
  BuildSpecificationError,
  parseProjectSpecification,
} from "./index";

const requirements = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
} as const;

function validSpecification() {
  return {
    version: 1,
    name: "  Portfolio Site  ",
    projectType: "fullstack-app",
    targets: ["web"],
    requirements,
    pages: [" Home ", "About"],
    stackId: " tanstack-start-v1 ",
    deployment: { preference: "managed-runtime" },
  };
}

describe("ProjectSpecification runtime validation", () => {
  it("normalizes an untrusted v1 specification into its canonical shape", () => {
    expect(parseProjectSpecification(validSpecification())).toEqual({
      version: 1,
      name: "Portfolio Site",
      projectType: "fullstack-app",
      targets: ["web"],
      requirements,
      pages: ["Home", "About"],
      stackId: "tanstack-start-v1",
      deployment: { preference: "managed-runtime" },
    });
  });

  it("requires a commerce plan for commerce projects", () => {
    expect(() =>
      parseProjectSpecification({
        ...validSpecification(),
        requirements: {
          ...requirements,
          payments: true,
          commerce: true,
        },
        projectType: "fullstack-app",
        stackId: "tanstack-start-v1",
      }),
    ).toThrow(BuildSpecificationError);

    const parsed =
      parseProjectSpecification({
        ...validSpecification(),
        requirements: {
          ...requirements,
          payments: true,
          commerce: true,
        },
        projectType: "fullstack-app",
        stackId: "tanstack-start-v1",
        commerce: {
          storefrontRuntime: "tanstack-start",
        },
      });

    expect(parsed.commerce).toEqual({
      storefrontRuntime: "tanstack-start",
    });
  });

  it("rejects commerce plans on non-commerce projects", () => {
    expect(() =>
      parseProjectSpecification({
        ...validSpecification(),
        commerce: {
          storefrontRuntime: "tanstack-start",
        },
      }),
    ).toThrow(BuildSpecificationError);
  });

  it("rejects unknown versions, targets, and non-boolean requirements", () => {
    expect(() =>
      parseProjectSpecification({
        ...validSpecification(),
        version: 2,
        targets: ["desktop"],
        requirements: { ...requirements, database: "yes" },
      }),
    ).toThrow(BuildSpecificationError);
  });

  it("rejects duplicate targets and duplicate canonical page names", () => {
    expect(() =>
      parseProjectSpecification({
        ...validSpecification(),
        targets: ["web", "web"],
        pages: ["Home", " Home "],
      }),
    ).toThrow(BuildSpecificationError);
  });

  it("discards unknown transport fields instead of persisting them", () => {
    const parsed = parseProjectSpecification({
      ...validSpecification(),
      providerToken: "must-not-survive",
    }) as Record<string, unknown>;

    expect(parsed.providerToken).toBeUndefined();
  });
});
