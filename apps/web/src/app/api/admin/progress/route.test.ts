import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  normalize: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdmin", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/admin/progress/query", () => ({
  searchParamsToProgressQuery: mocks.normalize,
  getProgressDashboard: mocks.load,
}));

import { GET, OPTIONS } from "./route";

const ADMIN_ORIGIN = "http://localhost:3001";

function request(origin = ADMIN_ORIGIN) {
  return new Request(
    "http://localhost:3000/api/admin/progress?range=7d",
    {
      headers: { origin },
    },
  );
}

describe("Admin progress browser API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.normalize.mockReturnValue({ range: "7d" });
    mocks.load.mockResolvedValue({
      meta: { range: "7d" },
      overview: {},
      insights: {},
      learners: [],
    });
  });

  it("serves the Vite Admin origin through the canonical admin guard", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      ADMIN_ORIGIN,
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.load).toHaveBeenCalledWith({ range: "7d" });
  });

  it("rejects an untrusted browser origin before data access", async () => {
    const response = await GET(request("https://evil.example"));

    expect(response.status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("preflights from Admin", () => {
    const response = OPTIONS(
      new Request("http://localhost:3000/api/admin/progress", {
        method: "OPTIONS",
        headers: { origin: ADMIN_ORIGIN },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      ADMIN_ORIGIN,
    );
  });
});
