import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  listPublicChallengeAudienceContacts,
  renderPublicChallengeCampaign,
  sendPublicChallengeCampaignNow,
  sendPublicChallengeCampaignTest,
} from "@/lib/marketing/publicChallengeCampaign";

const env = {
  BREVO_API_KEY: "brevo-test-key",
  BREVO_MARKETING_LIST_ID: "42",
  BREVO_FROM_EMAIL: "news@zoeskoul.com",
  BREVO_FROM_NAME: "ZoeSkoul",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("publicChallengeCampaign", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders escaped campaign HTML with Brevo unsubscribe support", () => {
    const rendered = renderPublicChallengeCampaign({
      title: '<script>alert("x")</script> SQL challenge',
      description: "Try <b>this</b> challenge.",
      challengeUrl: "https://zoeskoul.com/c/test",
      imageUrl: "https://images.example.com/challenge.png",
    });

    expect(rendered.subject).toBe("Your Daily ZoeSkoul Challenge is ready");
    expect(rendered.html).toContain("https://zoeskoul.com/c/test");
    expect(rendered.html).toContain("{{ unsubscribe }}");
    expect(rendered.html).toContain("Try the challenge");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<b>this</b>");
  });

  it("marks Brevo provider suppressions without requiring a ZoeSkoul account", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          name: "ZoeSkoul Subscribers",
          folderId: 3,
          totalSubscribers: 3,
        }),
      )
      .mockResolvedValueOnce(
        json({
          count: 3,
          contacts: [
            {
              email: "jane@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [],
              attributes: { FIRSTNAME: "Jane", LASTNAME: "Doe" },
            },
            {
              email: "blocked@example.com",
              emailBlacklisted: true,
              listUnsubscribed: [],
              attributes: {},
            },
            {
              email: "left@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [42],
              attributes: {},
            },
          ],
        }),
      );

    const result = await listPublicChallengeAudienceContacts(42, {
      env,
      fetchImpl,
    });

    expect(result.counts).toEqual({
      total: 3,
      selectable: 1,
      suppressed: 2,
    });
    expect(result.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "jane@example.com",
          name: "Jane Doe",
          selectable: true,
        }),
        expect.objectContaining({
          email: "blocked@example.com",
          suppressionReason: "blacklisted",
        }),
        expect.objectContaining({
          email: "left@example.com",
          suppressionReason: "unsubscribed",
        }),
      ]),
    );
  });

  it("uses an exclusion list for individually deselected contacts", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          name: "ZoeSkoul Subscribers",
          folderId: 3,
          totalSubscribers: 2,
        }),
      )
      .mockResolvedValueOnce(
        json({
          count: 2,
          contacts: [
            {
              email: "jane@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [],
              attributes: {},
            },
            {
              email: "mark@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [],
              attributes: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ id: 77 }, 201))
      .mockResolvedValueOnce(
        json({ success: ["mark@example.com"], failure: [] }, 201),
      )
      .mockResolvedValueOnce(
        json({
          senders: [
            {
              id: 12,
              name: "ZoeSkoul",
              email: "challenges@zoeskoul.com",
              active: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ id: 91 }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await sendPublicChallengeCampaignNow(
      {
        sourceListId: 42,
        excludedEmails: ["mark@example.com"],
        title: "SQL joins",
        description: "Can you solve it?",
        challengeUrl: "https://zoeskoul.com/c/sql-joins",
        imageUrl: null,
      },
      { env, fetchImpl },
    );

    expect(result).toMatchObject({
      campaignId: 91,
      sourceListId: 42,
      exclusionListId: 77,
      selectedCount: 1,
    });

    const campaignCall = fetchImpl.mock.calls.find(([url]) =>
      String(url).endsWith("/emailCampaigns"),
    );
    const campaignBody = JSON.parse(
      String(campaignCall?.[1]?.body),
    );
    expect(campaignBody.recipients).toEqual({
      listIds: [42],
      exclusionListIds: [77],
    });
    expect(campaignBody.sender).toEqual({
      email: "challenges@zoeskoul.com",
      name: "ZoeSkoul Challenges",
    });
    expect(campaignBody.replyTo).toBe("support@zoeskoul.com");
  });

  it("uses Brevo sendTest only for the publisher test email", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          name: "ZoeSkoul Subscribers",
          folderId: 3,
          totalSubscribers: 100,
        }),
      )
      .mockResolvedValueOnce(
        json({
          count: 1,
          contacts: [
            {
              email: "publisher@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [],
              attributes: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          senders: [
            {
              id: 12,
              name: "ZoeSkoul",
              email: "challenges@zoeskoul.com",
              active: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ id: 55 }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await sendPublicChallengeCampaignTest(
      {
        sourceListId: 42,
        testEmail: "publisher@example.com",
        title: "Python challenge",
        description: "Try it.",
        challengeUrl: "https://zoeskoul.com/c/python",
      },
      { env, fetchImpl },
    );

    expect(result).toMatchObject({
      campaignId: 55,
      testEmail: "publisher@example.com",
    });

    const sendTest = fetchImpl.mock.calls.find(([url]) =>
      String(url).endsWith("/emailCampaigns/55/sendTest"),
    );
    expect(JSON.parse(String(sendTest?.[1]?.body))).toEqual({
      emailTo: ["publisher@example.com"],
    });
  });
  it("fails clearly when the configured sender is inactive", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          name: "ZoeSkoul Subscribers",
          folderId: 3,
          totalSubscribers: 100,
        }),
      )
      .mockResolvedValueOnce(
        json({
          count: 1,
          contacts: [
            {
              email: "publisher@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [],
              attributes: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          senders: [
            {
              id: 12,
              name: "ZoeSkoul",
              email: "challenges@zoeskoul.com",
              active: false,
            },
          ],
        }),
      );

    await expect(
      sendPublicChallengeCampaignTest(
        {
          sourceListId: 42,
          testEmail: "publisher@example.com",
          title: "Python challenge",
          description: "Try it.",
          challengeUrl: "https://zoeskoul.com/c/python",
        },
        { env, fetchImpl },
      ),
    ).rejects.toThrow("not active/verified");
  });

  it("preserves Brevo 400 detail for test sends", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          name: "ZoeSkoul Subscribers",
          folderId: 3,
          totalSubscribers: 100,
        }),
      )
      .mockResolvedValueOnce(
        json({
          count: 1,
          contacts: [
            {
              email: "publisher@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [],
              attributes: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          senders: [
            {
              id: 12,
              name: "ZoeSkoul",
              email: "challenges@zoeskoul.com",
              active: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ id: 55 }, 201))
      .mockResolvedValueOnce(
        json(
          {
            code: "invalid_parameter",
            message: "Test recipient is not eligible.",
          },
          400,
        ),
      );

    await expect(
      sendPublicChallengeCampaignTest(
        {
          sourceListId: 42,
          testEmail: "publisher@example.com",
          title: "Python challenge",
          description: "Try it.",
          challengeUrl: "https://zoeskoul.com/c/python",
        },
        { env, fetchImpl },
      ),
    ).rejects.toThrow(
      "invalid_parameter: Test recipient is not eligible.",
    );
  });

  it("rejects a test recipient that is not in the selected Brevo list", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          name: "ZoeSkoul Subscribers",
          folderId: 3,
          totalSubscribers: 1,
        }),
      )
      .mockResolvedValueOnce(
        json({
          count: 1,
          contacts: [
            {
              email: "member@example.com",
              emailBlacklisted: false,
              listUnsubscribed: [],
              attributes: {},
            },
          ],
        }),
      );

    await expect(
      sendPublicChallengeCampaignTest(
        {
          sourceListId: 42,
          testEmail: "outside@example.com",
          title: "Python challenge",
          description: "Try it.",
          challengeUrl: "https://zoeskoul.com/c/python",
        },
        { env, fetchImpl },
      ),
    ).rejects.toThrow("not in the selected Brevo list");

    expect(
      fetchImpl.mock.calls.some(([url]) =>
        String(url).endsWith("/emailCampaigns"),
      ),
    ).toBe(false);
  });

  it("rejects a blacklisted test contact before creating a campaign", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          name: "ZoeSkoul Subscribers",
          folderId: 3,
          totalSubscribers: 1,
        }),
      )
      .mockResolvedValueOnce(
        json({
          count: 1,
          contacts: [
            {
              email: "blocked@example.com",
              emailBlacklisted: true,
              listUnsubscribed: [],
              attributes: {},
            },
          ],
        }),
      );

    await expect(
      sendPublicChallengeCampaignTest(
        {
          sourceListId: 42,
          testEmail: "blocked@example.com",
          title: "Python challenge",
          description: "Try it.",
          challengeUrl: "https://zoeskoul.com/c/python",
        },
        { env, fetchImpl },
      ),
    ).rejects.toThrow("blacklisted");
  });

});
