import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureKey } from "@zoeskoul/db";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findUser: vi.fn(),
  findGrants: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdmin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    featureGrant: { findMany: mocks.findGrants },
  },
}));

import { GET } from "./route";

function request(userId = "user_1", origin = "http://localhost:3001") {
  return new Request(
    `http://localhost:3000/api/admin/zoebuild-entitlements?userId=${encodeURIComponent(userId)}`,
    { headers: { Origin: origin } },
  );
}

describe("Admin ZoeBuild entitlement audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({ id: "user_1" });
    mocks.findGrants.mockResolvedValue([]);
  });

  it("rejects an untrusted origin before admin or database access", async () => {
    const res = await GET(request("user_1", "https://localhost.evil.example"));
    expect(res.status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.findGrants).not.toHaveBeenCalled();
  });

  it("requires canonical web admin authorization", async () => {
    mocks.requireAdmin.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("rejects missing and malformed identities without database access", async () => {
    for (const id of ["", "../target", "@email.example"]) {
      const res = await GET(request(id));
      expect(res.status).toBe(400);
    }
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("reports absent users without exposing unrelated grants", async () => {
    mocks.findUser.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(404);
    expect(mocks.findGrants).not.toHaveBeenCalled();
  });

  it("returns separate, timestamp-verified edit and generation statuses", async () => {
    const now = Date.now();
    mocks.findGrants.mockResolvedValue([
      { id: "g1", feature: FeatureKey.build_ai_generate, type: "subscription", startsAt: new Date(now - 10_000), endsAt: new Date(now + 10_000), revokedAt: null },
      { id: "g2", feature: FeatureKey.build_ai_edit, type: "admin", startsAt: null, endsAt: null, revokedAt: new Date(now - 1_000) },
      { id: "g3", feature: FeatureKey.build_ai_edit, type: "trial", startsAt: new Date(now + 10_000), endsAt: null, revokedAt: null },
    ]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = await res.json();
    expect(body.grants.map((g: { active: boolean }) => g.active)).toEqual([true, false, false]);
    expect(mocks.findGrants).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1", feature: { in: [FeatureKey.build_ai_generate, FeatureKey.build_ai_edit] } },
    }));
  });

  it("fails closed on a database error", async () => {
    mocks.findGrants.mockRejectedValue(new Error("db secret should not leak"));
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("db secret");
  });
});
