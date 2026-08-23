import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  normalize: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdmin", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/admin/progress/questionAnalytics", () => ({
  searchParamsToQuestionAnalyticsQuery: mocks.normalize,
  getQuestionAnalytics: mocks.load,
}));

import { GET } from "./route";

const ADMIN_ORIGIN = "http://localhost:3001";

describe("Admin question analytics browser API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.normalize.mockReturnValue({ range: "30d", minAttempts: 3 });
    mocks.load.mockResolvedValue({
      meta: {},
      overview: {},
      questions: [],
    });
  });

  it("reuses the canonical Web admin/CORS boundary", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/admin/questions?range=30d",
        {
          headers: { origin: ADMIN_ORIGIN },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      ADMIN_ORIGIN,
    );
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.load).toHaveBeenCalledOnce();
  });
});
