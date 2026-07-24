import { describe, expect, it } from "vitest";
import { resolveModuleAccess } from "./resolveModuleAccess";
import type { AccessSnapshot } from "./accessSnapshot";

function snapshot(overrides: Partial<AccessSnapshot> = {}): AccessSnapshot {
  return {
    actorKey: "user:u1",
    hasUser: true,
    isSubscribed: false,
    subjectAccess: new Set(),
    moduleAccess: new Set(),
    featureAccess: new Set(),
    ...overrides,
  };
}

const moduleConfig = {
  id: "m1",
  slug: "module-1",
  accessOverride: "inherit" as const,
};

describe("resolveModuleAccess private course delivery", () => {
  it("keeps public free courses free", () => {
    expect(
      resolveModuleAccess({
        subject: {
          id: "s1",
          slug: "public-course",
          visibility: "public",
          accessPolicy: "free",
        },
        module: moduleConfig,
        snapshot: snapshot({ hasUser: false }),
      }),
    ).toEqual({ ok: true, paid: false });
  });

  it("requires an assignment for a private course", () => {
    expect(
      resolveModuleAccess({
        subject: {
          id: "s1",
          slug: "private-course",
          visibility: "private",
          accessPolicy: "free",
        },
        module: moduleConfig,
        snapshot: snapshot(),
      }),
    ).toEqual({ ok: false, paid: false, reason: "requires_assignment" });
  });

  it("reuses subject access for direct or group assignments", () => {
    expect(
      resolveModuleAccess({
        subject: {
          id: "s1",
          slug: "private-course",
          visibility: "private",
          accessPolicy: "paid",
        },
        module: moduleConfig,
        snapshot: snapshot({ subjectAccess: new Set(["s1"]) }),
      }),
    ).toEqual({ ok: true, paid: true });
  });

  it("does not require a subscription for a teacher-assigned paid course", () => {
    expect(
      resolveModuleAccess({
        subject: {
          id: "s1",
          slug: "assigned-paid-course",
          visibility: "private",
          accessPolicy: "paid",
        },
        module: moduleConfig,
        snapshot: snapshot({
          isSubscribed: false,
          subjectAccess: new Set(["s1"]),
        }),
        requireAll: true,
      }),
    ).toEqual({ ok: true, paid: true });
  });
});
