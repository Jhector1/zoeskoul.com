import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let subscribeToBeehiiv: typeof import("./beehiiv").subscribeToBeehiiv;
let unsubscribeFromBeehiiv: typeof import("./beehiiv").unsubscribeFromBeehiiv;

beforeAll(async () => {
  ({ subscribeToBeehiiv, unsubscribeFromBeehiiv } = await import("./beehiiv"));
});

const configuredEnv = {
  BEEHIIV_API_KEY: "test-key",
  BEEHIIV_PUBLICATION_ID: "pub_00000000-0000-0000-0000-000000000000",
};

describe("Beehiiv marketing subscription sync", () => {
  it("does not call Beehiiv when server configuration is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await subscribeToBeehiiv({
      email: "learner@example.com",
      consentSource: "profile",
      env: {},
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      provider: "manual",
      reason: "not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates or explicitly reactivates a subscriber after opt-in", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "sub_00000000-0000-0000-0000-000000000000",
            status: "active",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await subscribeToBeehiiv({
      email: " Learner@Example.com ",
      consentSource: "authentication",
      env: configuredEnv,
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      provider: "beehiiv",
      externalContactId: "sub_00000000-0000-0000-0000-000000000000",
      status: "active",
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.beehiiv.com/v2/publications/pub_00000000-0000-0000-0000-000000000000/subscriptions",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      email: "learner@example.com",
      reactivate_existing: true,
      send_welcome_email: false,
      utm_source: "zoeskoul",
      utm_medium: "product",
      utm_campaign: "authentication",
    });
  });

  it("unsubscribes by stored subscriber ID when available", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "sub_00000000-0000-0000-0000-000000000000",
            status: "inactive",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await unsubscribeFromBeehiiv({
      email: "learner@example.com",
      subscriberId: "sub_00000000-0000-0000-0000-000000000000",
      env: configuredEnv,
      fetchImpl,
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.beehiiv.com/v2/publications/pub_00000000-0000-0000-0000-000000000000/subscriptions/sub_00000000-0000-0000-0000-000000000000",
    );
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ unsubscribe: true });
  });

  it("falls back to Beehiiv's by-email update endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: "sub_1", status: "inactive" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await unsubscribeFromBeehiiv({
      email: "learner+news@example.com",
      env: configuredEnv,
      fetchImpl,
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.beehiiv.com/v2/publications/pub_00000000-0000-0000-0000-000000000000/subscriptions/by_email/learner%2Bnews%40example.com",
    );
  });
});
