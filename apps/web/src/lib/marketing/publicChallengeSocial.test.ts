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
      X_USER_ACCESS_TOKEN: "secret-x",
    } as NodeJS.ProcessEnv);

    expect(statuses.every((item) => item.configured)).toBe(true);
    expect(JSON.stringify(statuses)).not.toContain("secret-");
  });

  it("creates an X post through the canonical adapter", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: { id: "tweet-123" } }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;

    const result = await publishPublicChallengeToProvider(
      "x",
      content,
      {
        env: {
          NODE_ENV: "test",
          X_USER_ACCESS_TOKEN: "token",
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
    expect(fetcher).toHaveBeenCalledOnce();

    const [url, init] =
      vi.mocked(fetcher).mock.calls[0]!;
    expect(String(url)).toBe("https://api.x.com/2/tweets");
    const payload = JSON.parse(
      String(init?.body),
    ) as { text?: string };

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
