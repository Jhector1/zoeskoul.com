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
  searchParamsToLearnerProgressDetailQuery: mocks.normalize,
  getLearnerProgressDetail: mocks.load,
}));

import { GET } from "./route";

const ADMIN_ORIGIN = "http://localhost:3001";

function request() {
  return new Request(
    "http://localhost:3000/api/admin/learners/user%3A123?range=30d",
    {
      headers: { origin: ADMIN_ORIGIN },
    },
  );
}

describe("Admin learner detail browser API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.normalize.mockReturnValue({ range: "30d", limit: 30 });
    mocks.load.mockResolvedValue({
      meta: {},
      learner: {},
      summary: {},
      history: [],
      weakTopics: [],
    });
  });

  it("decodes the actor key and serves Admin through Web", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ actorKey: "user%3A123" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      ADMIN_ORIGIN,
    );
    expect(mocks.load).toHaveBeenCalledWith({
      actorKey: "user:123",
      query: { range: "30d", limit: 30 },
    });
  });

  it("returns a CORS-aware 404 for a missing learner", async () => {
    mocks.load.mockResolvedValue(null);

    const response = await GET(request(), {
      params: Promise.resolve({ actorKey: "user%3A404" }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      ADMIN_ORIGIN,
    );
  });
});
