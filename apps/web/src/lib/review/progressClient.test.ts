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

  it("uses the configured API origin with credentialed requests", async () => {
    const fetchImpl = vi.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ) =>
        Response.json({
          progress: {
            topics: {},
          },
        }),
    );

    await fetchReviewProgressGET({
      subjectSlug: "python",
      moduleSlug: "module-1",
      locale: "en",
      endpoint: "/api/review/progress?workspaceView=mine",
      apiOrigin: "https://zoeskoul.com",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [input, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(String(input));

    expect(url.origin).toBe("https://zoeskoul.com");
    expect(url.pathname).toBe("/api/review/progress");
    expect(url.searchParams.get("workspaceView")).toBe("mine");
    expect(url.searchParams.get("subjectSlug")).toBe("python");
    expect(url.searchParams.get("moduleSlug")).toBe("module-1");
    expect(url.searchParams.get("locale")).toBe("en");
    expect(init?.credentials).toBe("include");
  });

  it("coalesces concurrent GETs for the same progress row", async () => {
    let resolveResponse:
      | ((response: Response) => void)
      | undefined;

    const fetchImpl = vi.fn(
      (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ) =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const args = {
      subjectSlug: "python",
      moduleSlug: "module-2",
      locale: "en",
      endpoint: "/api/review/progress",
      apiOrigin: "https://zoeskoul.com",
      fetchImpl,
    };

    const first = fetchReviewProgressGET(args);
    const second = fetchReviewProgressGET(args);

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveResponse?.(
      Response.json({
        progress: {
          topics: {},
        },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
