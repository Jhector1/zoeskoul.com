import {
  describe,
  expect,
  it,
} from "vitest";

import {
  loadDailyPracticePayload,
} from "./dailyPracticeBootstrap";

describe("Daily Practice bootstrap", () => {
  it("retries transient authorization failures", async () => {
    let calls = 0;

    const payload =
      await loadDailyPracticePayload({
        requestUrl:
          "https://web-preview.zoeskoul.com/api/student-ui/practice/daily?locale=en",
        signal:
          new AbortController().signal,
        retryDelaysMs: [0, 0],
        fetchImpl: async () => {
          calls += 1;

          if (calls < 3) {
            return new Response(
              JSON.stringify({
                error: "Unauthorized",
              }),
              {
                status: 401,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            );
          }

          return new Response(
            JSON.stringify({
              locale: "en",
              mode: "subscriber",
            }),
            {
              status: 200,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        },
      });

    expect(calls).toBe(3);
    expect(payload).toEqual({
      locale: "en",
      mode: "subscriber",
    });
  });

  it("retries a transient network failure", async () => {
    let calls = 0;

    const payload =
      await loadDailyPracticePayload({
        requestUrl:
          "https://web-preview.zoeskoul.com/api/student-ui/practice/daily?locale=en",
        signal:
          new AbortController().signal,
        retryDelaysMs: [0, 0],
        fetchImpl: async () => {
          calls += 1;

          if (calls === 1) {
            throw new TypeError(
              "Failed to fetch",
            );
          }

          return new Response(
            JSON.stringify({
              locale: "en",
            }),
            {
              status: 200,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        },
      });

    expect(calls).toBe(2);
    expect(payload).toEqual({
      locale: "en",
    });
  });

  it("does not retry a permanent not-found response", async () => {
    let calls = 0;

    await expect(
      loadDailyPracticePayload({
        requestUrl:
          "https://web-preview.zoeskoul.com/api/student-ui/practice/daily?locale=en",
        signal:
          new AbortController().signal,
        retryDelaysMs: [0, 0],
        fetchImpl: async () => {
          calls += 1;

          return new Response(
            JSON.stringify({
              error: "Not found",
            }),
            {
              status: 404,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        },
      }),
    ).rejects.toThrow("Not found");

    expect(calls).toBe(1);
  });
});
