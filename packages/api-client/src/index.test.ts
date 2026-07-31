import { describe, expect, it, vi } from "vitest";

import { ApiClientError, createApiClient } from "./index";

describe("createApiClient", () => {
  it("always includes credentials and serializes JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ ok: true }),
    );
    const client = createApiClient({
      baseOrigin: "https://zoeskoul.com",
      fetchImpl,
    });

    await expect(client.request("/api/example", {
      method: "PATCH",
      json: { enabled: true },
    })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("/api/example", "https://zoeskoul.com"),
      expect.objectContaining({
        credentials: "include",
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });

  it("returns typed HTTP failures", async () => {
    await expect(createApiClient({
      baseOrigin: "https://zoeskoul.com",
      fetchImpl: async () =>
        Response.json({ error: "Forbidden" }, { status: 403 }),
    }).request("/api/example")).rejects.toEqual(
      expect.objectContaining<ApiClientError>({
        name: "ApiClientError",
        status: 403,
        message: "Forbidden",
        payload: { error: "Forbidden" },
      }),
    );
  });
});
