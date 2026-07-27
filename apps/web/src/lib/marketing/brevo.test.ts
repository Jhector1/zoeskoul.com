import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let subscribeToBrevo: typeof import("./brevo").subscribeToBrevo;
let unsubscribeFromBrevo: typeof import("./brevo").unsubscribeFromBrevo;

beforeAll(async () => {
  ({ subscribeToBrevo, unsubscribeFromBrevo } = await import("./brevo"));
});

const configuredEnv = {
  BREVO_API_KEY: "test-key",
  BREVO_MARKETING_LIST_ID: "42",
};

describe("Brevo marketing contact sync", () => {
  it("does not call Brevo when the marketing list is not configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await subscribeToBrevo({
      email: "learner@example.com",
      env: { BREVO_API_KEY: "test-key" },
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      provider: "manual",
      reason: "not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates or updates a contact and adds it to the newsletter list", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 123 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await subscribeToBrevo({
      email: " Learner@Example.com ",
      env: configuredEnv,
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      provider: "brevo",
      externalContactId: "123",
      status: "active",
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.brevo.com/v3/contacts");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "api-key": "test-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "learner@example.com",
      listIds: [42],
      updateEnabled: true,
      getId: true,
      emailBlacklisted: false,
    });
  });

  it("removes the contact only from the marketing list", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const result = await unsubscribeFromBrevo({
      email: "learner+news@example.com",
      env: configuredEnv,
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      provider: "brevo",
      externalContactId: null,
      status: "inactive",
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.brevo.com/v3/contacts/learner%2Bnews%40example.com",
    );
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ unlinkListIds: [42] });
  });

  it("treats an already-missing Brevo contact as unsubscribed", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "not found" }), { status: 404 }),
    );

    const result = await unsubscribeFromBrevo({
      email: "missing@example.com",
      env: configuredEnv,
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      provider: "brevo",
      status: "inactive",
    });
  });
});
