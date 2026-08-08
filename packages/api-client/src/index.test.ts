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

describe("toWebSocketUrl", () => {
  it("uses secure websocket transport from an HTTPS page", async () => {
    const { toWebSocketUrl } = await import("./index");

    vi.stubGlobal("window", {
      location: {
        href: "https://student.zoeskoul.com/en/subjects",
        protocol: "https:",
      },
    });

    expect(
      toWebSocketUrl("http://runner.example/socket"),
    ).toBe("wss://runner.example/socket");

    expect(
      toWebSocketUrl("ws://runner.example/socket"),
    ).toBe("wss://runner.example/socket");

    expect(
      toWebSocketUrl("https://runner.example/socket"),
    ).toBe("wss://runner.example/socket");

    expect(
      toWebSocketUrl("wss://runner.example/socket"),
    ).toBe("wss://runner.example/socket");

    vi.unstubAllGlobals();
  });

  it("uses ws transport from an HTTP page", async () => {
    const { toWebSocketUrl } = await import("./index");

    vi.stubGlobal("window", {
      location: {
        href: "http://localhost:3002/en/subjects",
        protocol: "http:",
      },
    });

    expect(
      toWebSocketUrl("https://runner.example/socket"),
    ).toBe("ws://runner.example/socket");

    expect(
      toWebSocketUrl("wss://runner.example/socket"),
    ).toBe("ws://runner.example/socket");

    vi.unstubAllGlobals();
  });

  it("resolves relative websocket URLs against the browser URL", async () => {
    const { toWebSocketUrl } = await import("./index");

    vi.stubGlobal("window", {
      location: {
        href: "https://student.zoeskoul.com/en/subjects",
        protocol: "https:",
      },
    });

    expect(
      toWebSocketUrl("/api/run/socket"),
    ).toBe(
      "wss://student.zoeskoul.com/api/run/socket",
    );

    vi.unstubAllGlobals();
  });
});
