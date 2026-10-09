import { describe, expect, it, vi } from "vitest";

import {
  publicChallengeSocialProviderStatuses,
  publishPublicChallengeToProvider,
} from "./publicChallengeSocial";
import {
  isPublicChallengeSocialAutomationDue,
  isValidPublicChallengeSocialTimezone,
  publicChallengeDailyScheduleOccurrence,
} from "./publicChallengeSocialAutomation";

const content = {
  title: "Daily Python challenge",
  description: "Can you solve it?",
  subjectSlug: "python-v2",
  challengeUrl: "https://zoeskoul.com/en/c/AbCdEf123",
  imageUrl:
    "https://res.cloudinary.com/demo/image/upload/challenge.jpg",
  imageAlt: "Python challenge",
};

function testEnv(
  values: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  return {
    ...values,
    NODE_ENV: "test",
  };
}

describe("public challenge social providers", () => {
  it("reports configuration without exposing secret values", () => {
    const statuses = publicChallengeSocialProviderStatuses(testEnv({
      NODE_ENV: "test",
      META_GRAPH_API_VERSION: "v26.0",
      FACEBOOK_PAGE_ID: "page-1",
      FACEBOOK_PAGE_ACCESS_TOKEN: "secret-facebook",
      INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-1",
      INSTAGRAM_ACCESS_TOKEN: "secret-instagram",
      LINKEDIN_VERSION: "202603",
      LINKEDIN_ACCESS_TOKEN: "secret-linkedin",
      LINKEDIN_AUTHOR_URN: "urn:li:organization:123",
      X_API_KEY: "secret-api-key",
      X_API_SECRET: "secret-api-secret",
      X_ACCESS_TOKEN: "secret-access-token",
      X_ACCESS_TOKEN_SECRET: "secret-access-secret",
      THREADS_ACCESS_TOKEN: "secret-threads",
      REDDIT_COMMERCIAL_API_APPROVED: "true",
      REDDIT_USER_AGENT: "zoeskoul:test:v1",
      REDDIT_SUBREDDIT: "zoeskoul",
      REDDIT_ACCESS_TOKEN: "secret-reddit",
      TIKTOK_ACCESS_TOKEN: "secret-tiktok",
      TIKTOK_PRIVACY_LEVEL: "PUBLIC_TO_EVERYONE",
      TIKTOK_DIRECT_POST_AUDITED: "true",
    }));

    expect(statuses.every((item) => item.configured)).toBe(true);
    expect(statuses.map((item) => item.provider)).toEqual([
      "facebook",
      "instagram",
      "linkedin",
      "x",
      "threads",
      "reddit",
      "tiktok",
    ]);
    expect(
      statuses.find((item) => item.provider === "x")?.imageRequired,
    ).toBe(true);
    expect(
      statuses.find((item) => item.provider === "tiktok")?.imageRequired,
    ).toBe(true);
    expect(
      statuses.find((item) => item.provider === "threads")?.imageRequired,
    ).toBe(false);
    expect(
      statuses.find((item) => item.provider === "reddit")?.imageRequired,
    ).toBe(false);
    expect(JSON.stringify(statuses)).not.toContain("secret-");
  });

  it("uploads the challenge image before creating an X post", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === content.imageUrl) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }

      if (url.endsWith("/media/upload/initialize")) {
        return new Response(
          JSON.stringify({ data: { id: "media-123" } }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/media-123/append")) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith("/media-123/finalize")) {
        return new Response(
          JSON.stringify({ data: { id: "media-123" } }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url === "https://api.x.com/2/tweets") {
        return new Response(
          JSON.stringify({ data: { id: "tweet-123" } }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response("unexpected request", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await publishPublicChallengeToProvider(
      "x",
      content,
      {
        env: testEnv({
          NODE_ENV: "test",
          X_API_KEY: "api-key",
          X_API_SECRET: "api-secret",
          X_ACCESS_TOKEN: "access-token",
          X_ACCESS_TOKEN_SECRET: "access-secret",
          X_USERNAME: "zoeskoul",
        }),
        fetcher,
      },
    );

    expect(result).toEqual({
      providerPostId: "tweet-123",
      providerPostUrl:
        "https://x.com/zoeskoul/status/tweet-123",
    });
    expect(fetcher).toHaveBeenCalledTimes(5);

    const [imageUrl, imageInit] =
      vi.mocked(fetcher).mock.calls[0]!;
    expect(String(imageUrl)).toBe(content.imageUrl);
    expect(imageInit?.method).toBe("GET");

    const [initializeUrl, initializeInit] =
      vi.mocked(fetcher).mock.calls[1]!;
    expect(String(initializeUrl)).toBe(
      "https://api.x.com/2/media/upload/initialize",
    );
    expect(JSON.parse(String(initializeInit?.body))).toEqual({
      total_bytes: 4,
      media_type: "image/jpeg",
      media_category: "tweet_image",
    });
    const initializeAuthorization = new Headers(
      initializeInit?.headers,
    ).get("Authorization");
    expect(initializeAuthorization).toMatch(/^OAuth /);
    expect(initializeAuthorization).toContain(
      'oauth_consumer_key="api-key"',
    );
    expect(initializeAuthorization).toContain(
      'oauth_token="access-token"',
    );
    expect(initializeAuthorization).toContain(
      'oauth_signature_method="HMAC-SHA1"',
    );
    expect(initializeAuthorization).not.toContain(
      "api-secret",
    );
    expect(initializeAuthorization).not.toContain(
      "access-secret",
    );

    const [appendUrl, appendInit] =
      vi.mocked(fetcher).mock.calls[2]!;
    expect(String(appendUrl)).toBe(
      "https://api.x.com/2/media/upload/media-123/append",
    );
    expect(appendInit?.body).toBeInstanceOf(FormData);
    const appendBody = appendInit?.body as FormData;
    expect(appendBody.get("segment_index")).toBe("0");
    expect(appendBody.get("media")).toBeInstanceOf(Blob);

    const [finalizeUrl] =
      vi.mocked(fetcher).mock.calls[3]!;
    expect(String(finalizeUrl)).toBe(
      "https://api.x.com/2/media/upload/media-123/finalize",
    );

    const [url, init] =
      vi.mocked(fetcher).mock.calls[4]!;
    expect(String(url)).toBe("https://api.x.com/2/tweets");
    const postAuthorization = new Headers(init?.headers).get(
      "Authorization",
    );
    expect(postAuthorization).toMatch(/^OAuth /);
    expect(postAuthorization).not.toContain("Bearer");
    const payload = JSON.parse(
      String(init?.body),
    ) as {
      text?: string;
      media?: { media_ids?: string[] };
    };

    expect(payload.media?.media_ids).toEqual(["media-123"]);
    expect(payload.text).toContain(
      content.description,
    );
    expect(payload.text).toContain(
      content.challengeUrl,
    );
    expect(payload.text).toContain(
      "#Python",
    );
    expect(payload.text).toContain(
      "#CodingChallenge",
    );
    expect(payload.text).toContain(
      "#ZoeSkoul",
    );
    expect(
      payload.text?.length ?? 0,
    ).toBeLessThanOrEqual(280);
  });

  it("includes the authored description and hashtags in Facebook copy", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "page-1_post-1",
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
          },
        },
      ),
    ) as unknown as typeof fetch;

    await publishPublicChallengeToProvider(
      "facebook",
      content,
      {
        env: testEnv({
          NODE_ENV: "test",
          META_GRAPH_API_VERSION:
            "v26.0",
          FACEBOOK_PAGE_ID:
            "page-1",
          FACEBOOK_PAGE_ACCESS_TOKEN:
            "token",
        }),
        fetcher,
      },
    );

    const [, init] =
      vi.mocked(fetcher).mock.calls[0]!;

    const params =
      new URLSearchParams(
        String(init?.body),
      );

    const message =
      params.get("message") ?? "";

    expect(message).toContain(
      content.description,
    );
    expect(message).toContain(
      content.challengeUrl,
    );
    expect(message).toContain(
      "#Python",
    );
    expect(message).toContain(
      "#CodingChallenge",
    );
    expect(message).toContain(
      "#Programming",
    );
    expect(message).toContain(
      "#ZoeSkoul",
    );
  });

  it("publishes a shared image challenge to Threads", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/me/threads")) {
        return new Response(JSON.stringify({ id: "container-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/me/threads_publish")) {
        return new Response(JSON.stringify({ id: "thread-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("unexpected request", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      publishPublicChallengeToProvider("threads", content, {
        env: testEnv({
          THREADS_ACCESS_TOKEN: "threads-token",
        }),
        fetcher,
      }),
    ).resolves.toEqual({
      providerPostId: "thread-1",
      providerPostUrl: null,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [, createInit] = vi.mocked(fetcher).mock.calls[0]!;
    const createBody = new URLSearchParams(String(createInit?.body));
    expect(createBody.get("media_type")).toBe("IMAGE");
    expect(createBody.get("image_url")).toBe(content.imageUrl);
    expect(createBody.get("text")).toContain(content.description);
    expect(createBody.get("text")).toContain(content.challengeUrl);
    expect(createBody.get("access_token")).toBe("threads-token");
  });

  it("posts a TikTok-safe photo after checking creator settings", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/creator_info/query/")) {
        return new Response(
          JSON.stringify({
            data: {
              privacy_level_options: [
                "PUBLIC_TO_EVERYONE",
                "SELF_ONLY",
              ],
              comment_disabled: false,
            },
            error: { code: "ok", message: "" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/content/init/")) {
        return new Response(
          JSON.stringify({
            data: { publish_id: "publish-1" },
            error: { code: "ok", message: "" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response("unexpected request", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      publishPublicChallengeToProvider("tiktok", content, {
        env: testEnv({
          TIKTOK_ACCESS_TOKEN: "tiktok-token",
          TIKTOK_PRIVACY_LEVEL: "PUBLIC_TO_EVERYONE",
          TIKTOK_DIRECT_POST_AUDITED: "true",
        }),
        fetcher,
      }),
    ).resolves.toEqual({
      providerPostId: "publish-1",
      providerPostUrl: null,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [, publishInit] = vi.mocked(fetcher).mock.calls[1]!;
    const payload = JSON.parse(String(publishInit?.body)) as {
      post_info: {
        description: string;
        brand_content_toggle: boolean;
        brand_organic_toggle: boolean;
      };
      source_info: { photo_images: string[] };
    };

    expect(payload.source_info.photo_images).toEqual([content.imageUrl]);
    expect(payload.post_info.description).toBe(content.description);
    expect(payload.post_info.description).not.toContain(content.challengeUrl);
    expect(payload.post_info.description).not.toContain("#ZoeSkoul");
    expect(payload.post_info.brand_content_toggle).toBe(false);
    expect(payload.post_info.brand_organic_toggle).toBe(true);
  });

  it("checks Reddit requirements before submitting a self post", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/v1/zoeskoul/post_requirements")) {
        return new Response(
          JSON.stringify({
            body_restriction_policy: "none",
            body_text_max_length: 4000,
            title_text_max_length: 300,
            title_text_min_length: 1,
            is_flair_required: false,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/submit")) {
        return new Response(
          JSON.stringify({
            json: {
              errors: [],
              data: {
                name: "t3_post1",
                url: "https://www.reddit.com/r/zoeskoul/comments/post1/",
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response("unexpected request", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      publishPublicChallengeToProvider("reddit", content, {
        env: testEnv({
          REDDIT_COMMERCIAL_API_APPROVED: "true",
          REDDIT_USER_AGENT: "zoeskoul:test:v1",
          REDDIT_SUBREDDIT: "zoeskoul",
          REDDIT_ACCESS_TOKEN: "reddit-token",
        }),
        fetcher,
      }),
    ).resolves.toEqual({
      providerPostId: "t3_post1",
      providerPostUrl:
        "https://www.reddit.com/r/zoeskoul/comments/post1/",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [, requirementsInit] = vi.mocked(fetcher).mock.calls[0]!;
    expect(new Headers(requirementsInit?.headers).get("User-Agent")).toBe(
      "zoeskoul:test:v1",
    );

    const [, submitInit] = vi.mocked(fetcher).mock.calls[1]!;
    const form = new URLSearchParams(String(submitInit?.body));
    expect(form.get("kind")).toBe("self");
    expect(form.get("sr")).toBe("zoeskoul");
    expect(form.get("validate_on_submit")).toBe("true");
    expect(form.get("text")).toContain(content.description);
    expect(form.get("text")).toContain(content.challengeUrl);
  });

  it("keeps Reddit disabled until commercial API use is approved", () => {
    const status = publicChallengeSocialProviderStatuses(testEnv({
      REDDIT_COMMERCIAL_API_APPROVED: "false",
      REDDIT_USER_AGENT: "zoeskoul:test:v1",
      REDDIT_SUBREDDIT: "zoeskoul",
      REDDIT_ACCESS_TOKEN: "reddit-token",
    })).find((item) => item.provider === "reddit");

    expect(status?.configured).toBe(false);
  });

  it("keeps public TikTok posting disabled until the Direct Post client is audited", () => {
    const status = publicChallengeSocialProviderStatuses(testEnv({
      TIKTOK_ACCESS_TOKEN: "tiktok-token",
      TIKTOK_PRIVACY_LEVEL: "PUBLIC_TO_EVERYONE",
      TIKTOK_DIRECT_POST_AUDITED: "false",
    })).find((item) => item.provider === "tiktok");

    expect(status?.configured).toBe(false);
  });

  it("requires a TikTok-safe image before calling TikTok", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      publishPublicChallengeToProvider(
        "tiktok",
        { ...content, imageUrl: null },
        {
          env: testEnv({
            TIKTOK_ACCESS_TOKEN: "tiktok-token",
            TIKTOK_PRIVACY_LEVEL: "PUBLIC_TO_EVERYONE",
            TIKTOK_DIRECT_POST_AUDITED: "true",
        }),
          fetcher,
        },
      ),
    ).rejects.toThrow(
      "TikTok requires a public, TikTok-safe challenge image.",
    );

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires an image before calling X", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      publishPublicChallengeToProvider(
        "x",
        { ...content, imageUrl: null },
        {
          env: testEnv({
            NODE_ENV: "test",
            X_API_KEY: "api-key",
            X_API_SECRET: "api-secret",
            X_ACCESS_TOKEN: "access-token",
            X_ACCESS_TOKEN_SECRET: "access-secret",
        }),
          fetcher,
        },
      ),
    ).rejects.toThrow(
      "X requires a public challenge image.",
    );

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires an image before calling Instagram", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      publishPublicChallengeToProvider(
        "instagram",
        { ...content, imageUrl: null },
        {
          env: testEnv({
            NODE_ENV: "test",
            INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-1",
            INSTAGRAM_ACCESS_TOKEN: "token",
        }),
          fetcher,
        },
      ),
    ).rejects.toThrow(
      "Instagram requires a public challenge image.",
    );

    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("daily social automation schedule", () => {
  it("validates IANA timezones", () => {
    expect(
      isValidPublicChallengeSocialTimezone(
        "America/Chicago",
      ),
    ).toBe(true);
    expect(
      isValidPublicChallengeSocialTimezone(
        "Definitely/Not-A-Timezone",
      ),
    ).toBe(false);
  });

  it("does not impose a rolling 24-hour cooldown", () => {
    const yesterdayAtFour = publicChallengeDailyScheduleOccurrence({
      localTime: "16:00",
      timezone: "America/Chicago",
      now: new Date("2026-10-07T21:00:00.000Z"),
    });
    const todayAtTen = publicChallengeDailyScheduleOccurrence({
      localTime: "10:00",
      timezone: "America/Chicago",
      now: new Date("2026-10-08T15:00:00.000Z"),
    });

    expect(todayAtTen.dispatchDate).toBe("2026-10-08");
    expect(todayAtTen.id).not.toBe(yesterdayAtFour.id);
    expect(
      new Date("2026-10-08T15:00:00.000Z").getTime() -
        new Date("2026-10-07T21:00:00.000Z").getTime(),
    ).toBe(18 * 60 * 60 * 1000);
  });

  it("treats different configured times on the same day as different occurrences", () => {
    const ten = publicChallengeDailyScheduleOccurrence({
      localTime: "10:00",
      timezone: "America/Chicago",
      now: new Date("2026-10-08T15:00:00.000Z"),
    });
    const four = publicChallengeDailyScheduleOccurrence({
      localTime: "16:00",
      timezone: "America/Chicago",
      now: new Date("2026-10-08T21:00:00.000Z"),
    });
    const tenRetry = publicChallengeDailyScheduleOccurrence({
      localTime: "10:00",
      timezone: "America/Chicago",
      now: new Date("2026-10-08T15:07:00.000Z"),
    });

    expect(four.id).not.toBe(ten.id);
    expect(tenRetry).toEqual(ten);
  });

  it("becomes due at or after the configured local time", () => {
    expect(
      isPublicChallengeSocialAutomationDue({
        enabled: true,
        localTime: "09:00",
        timezone: "America/Chicago",
        now: new Date("2026-09-25T14:00:00.000Z"),
      }),
    ).toBe(true);

    expect(
      isPublicChallengeSocialAutomationDue({
        enabled: false,
        localTime: "09:00",
        timezone: "America/Chicago",
        now: new Date("2026-09-25T16:00:00.000Z"),
      }),
    ).toBe(false);
  });
});

vi.mock("server-only", () => ({}));
