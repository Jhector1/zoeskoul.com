import { describe, expect, it, vi } from "vitest";

import {
  publicChallengeSocialProviderStatuses,
  publishPublicChallengeToProvider,
} from "./publicChallengeSocial";
import {
  isPublicChallengeSocialAutomationDue,
  isValidPublicChallengeSocialTimezone,
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

describe("public challenge social providers", () => {
  it("reports configuration without exposing secret values", () => {
    const statuses = publicChallengeSocialProviderStatuses({
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
    } as NodeJS.ProcessEnv);

    expect(statuses.every((item) => item.configured)).toBe(true);
    expect(
      statuses.find((item) => item.provider === "x")?.imageRequired,
    ).toBe(true);
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
        env: {
          NODE_ENV: "test",
          X_API_KEY: "api-key",
          X_API_SECRET: "api-secret",
          X_ACCESS_TOKEN: "access-token",
          X_ACCESS_TOKEN_SECRET: "access-secret",
          X_USERNAME: "zoeskoul",
        } as NodeJS.ProcessEnv,
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
        env: {
          NODE_ENV: "test",
          META_GRAPH_API_VERSION:
            "v26.0",
          FACEBOOK_PAGE_ID:
            "page-1",
          FACEBOOK_PAGE_ACCESS_TOKEN:
            "token",
        } as NodeJS.ProcessEnv,
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

  it("requires an image before calling X", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      publishPublicChallengeToProvider(
        "x",
        { ...content, imageUrl: null },
        {
          env: {
            NODE_ENV: "test",
            X_API_KEY: "api-key",
            X_API_SECRET: "api-secret",
            X_ACCESS_TOKEN: "access-token",
            X_ACCESS_TOKEN_SECRET: "access-secret",
          } as NodeJS.ProcessEnv,
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
          env: {
            NODE_ENV: "test",
            INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-1",
            INSTAGRAM_ACCESS_TOKEN: "token",
          } as NodeJS.ProcessEnv,
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
