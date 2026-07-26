import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchReviewProgressGET } from "./progressClient";

describe("fetchReviewProgressGET", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not turn a failed poll into an authoritative empty workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("temporary failure", { status: 503 })),
    );

    await expect(
      fetchReviewProgressGET({
        subjectSlug: "python",
        moduleSlug: "module-1",
        locale: "en",
        endpoint: "/api/test-progress-failure",
      }),
    ).rejects.toThrow("temporary failure");
  });

  it("returns a valid empty state only when the server confirms success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          progress: null,
        }),
      ),
    );

    await expect(
      fetchReviewProgressGET({
        subjectSlug: "python",
        moduleSlug: "module-1",
        locale: "en",
        endpoint: "/api/test-progress-empty",
      }),
    ).resolves.toMatchObject({
      topics: {},
      moduleCompleted: false,
    });
  });
});
