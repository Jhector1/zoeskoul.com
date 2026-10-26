import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allowed: vi.fn(), renew: vi.fn() }));
vi.mock("@/lib/auth/buildHandoffProtocol", () => ({ isServiceAuthorized: mocks.allowed }));
vi.mock("@/lib/auth/buildHandoffStore", () => ({
  EMPTY_BUILD_SESSION: { authenticated: false, user: null, roles: [], capabilities: [] },
  renewBuildHandoffSession: mocks.renew,
}));
vi.mock("@/lib/auth/buildHandoffBody", () => ({
  readLimitedHandoffJson: async (r: Request) => r.json().catch(() => null),
}));
import { POST } from "./route";
const request = (value: unknown) => new Request("https://zoeskoul.com/api/auth/build-handoff/renew", {
  method: "POST", headers: { authorization: "Bearer secure-service-only" },
  body: JSON.stringify(value),
});
const empty = { authenticated: false, user: null, roles: [], capabilities: [] };
describe("V12J.12B Web-owned session renewal", () => {
  beforeEach(() => { mocks.allowed.mockReset(); mocks.renew.mockReset(); mocks.allowed.mockReturnValue(true); });
  it("rejects unauthenticated service callers without Redis access", async () => {
    mocks.allowed.mockReturnValue(false);
    const response = await POST(request({sessionHash: "a".repeat(64)}));
    expect(response.status).toBe(401);
    expect(mocks.renew).not.toHaveBeenCalled();
  });
  it("returns an authenticated Web session only after Redis renewal", async () => {
    const user = {authenticated: true, user: {id: "u1", email: null, name: null, image: null}, roles: [], capabilities: []};
    mocks.renew.mockResolvedValue(user);
    const response = await POST(request({sessionHash: "b".repeat(64)}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.renew).toHaveBeenCalledWith("b".repeat(64));
  });
  it("treats expired sessions as unauthenticated without reissuing tickets", async () => {
    mocks.renew.mockResolvedValue(empty);
    const response = await POST(request({sessionHash: "c".repeat(64)}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(empty);
  });
  it("returns 503 without claiming logout on storage failure", async () => {
    mocks.renew.mockRejectedValue(new Error("private backend failure"));
    const response = await POST(request({sessionHash: "d".repeat(64)}));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private backend failure");
  });
});
