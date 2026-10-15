import { describe, expect, it } from "vitest";
import { requiredCapabilities, requiresManagedBackend } from "./index";

const empty = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
} as const;

describe("build contracts", () => {
  it("keeps static projects infrastructure-free", () => {
    expect(requiredCapabilities({ requirements: empty })).toEqual([]);
    expect(requiresManagedBackend({ requirements: empty })).toBe(false);
  });

  it("derives managed capabilities from requirements", () => {
    const requirements = {
      ...empty,
      backend: true,
      database: true,
      commerce: true,
    } as const;

    expect(requiredCapabilities({ requirements })).toEqual([
      "backend",
      "database",
      "commerce",
    ]);
    expect(requiresManagedBackend({ requirements })).toBe(true);
  });
});
