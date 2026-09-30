import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tutoring/clientContentRequestContext", () => ({
  tutoringContentRequestDedupeKey: () => "test-context",
  withTutoringContentRequestHeaders: (headers: Record<string, string> = {}) => headers,
}));

const spec = {
  subject: "python",
  moduleSlug: "module-1",
  topic: "topic-1",
  n: 1,
} as any;

describe("fetchReviewQuiz in-flight abort ownership", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not let the first caller abort the shared network request", async () => {
    let resolveFetch!: (value: Response) => void;

    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { fetchReviewQuiz } = await import("./clientApi");

    const first = new AbortController();
    const second = new AbortController();

    const firstWait = fetchReviewQuiz(spec, first.signal);
    const secondWait = fetchReviewQuiz(spec, second.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.signal).toBeUndefined();

    first.abort();

    await expect(firstWait).rejects.toMatchObject({
      name: "AbortError",
    });

    resolveFetch(
      new Response(
        JSON.stringify({
          questions: [{ kind: "practice", id: "q1" }],
          quizKey: "quiz-key",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(secondWait).resolves.toMatchObject({
      quizKey: "quiz-key",
    });
  });

  it("lets a joined caller abort only its own wait", async () => {
    let resolveFetch!: (value: Response) => void;

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const { fetchReviewQuiz } = await import("./clientApi");

    const first = new AbortController();
    const second = new AbortController();

    const firstWait = fetchReviewQuiz(spec, first.signal);
    const secondWait = fetchReviewQuiz(spec, second.signal);

    second.abort();

    await expect(secondWait).rejects.toMatchObject({
      name: "AbortError",
    });

    resolveFetch(
      new Response(
        JSON.stringify({
          questions: [{ kind: "practice", id: "q1" }],
          quizKey: "quiz-key",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(firstWait).resolves.toMatchObject({
      quizKey: "quiz-key",
    });
  });
});
