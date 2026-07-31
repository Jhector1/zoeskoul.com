import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AuthClientError,
  buildAuthenticateUrl,
  buildLogoutUrl,
  createAuthClient,
} from "./index";

function jsonResponse(
  body: unknown,
  init?: ResponseInit,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status: init?.status ?? 200,
      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}

describe("createAuthClient", () => {
  it("uses credentials include", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        authenticated: false,
        user: null,
        roles: [],
        capabilities: [],
      }),
    );

    await createAuthClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl,
    }).fetchSession();

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "/api/app-session",
        "https://zoeskoul.com",
      ),
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("returns an authenticated response with a plain capability array", async () => {
    const session = await createAuthClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl: async () =>
        jsonResponse({
          authenticated: true,
          user: {
            id: "user-1",
            name: "Zoe",
            email: "zoe@example.com",
            image: null,
          },
          roles: ["teacher"],
          capabilities: [
            "student:access",
            "teacher:access",
          ],
        }),
    }).fetchSession();

    expect(session.authenticated).toBe(true);

    if (session.authenticated) {
      expect(
        session.capabilities.includes(
          "teacher:access",
        ),
      ).toBe(true);
      expect(
        Array.isArray(
          session.capabilities,
        ),
      ).toBe(true);
      expect(
        Object.keys(
          session.capabilities,
        ),
      ).toEqual(["0", "1"]);
      expect(
        JSON.stringify(
          session.capabilities,
        ),
      ).toBe(
        "[\"student:access\",\"teacher:access\"]",
      );
      expect(
        (
          session.capabilities as unknown as Record<
            string,
            unknown
          >
        ).canUnlockAll,
      ).toBeUndefined();
    }
  });

  it("returns an unauthenticated response", async () => {
    await expect(
      createAuthClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl: async () =>
          jsonResponse({
            authenticated: false,
            user: null,
            roles: [],
            capabilities: [],
          }),
      }).fetchSession(),
    ).resolves.toMatchObject({
      authenticated: false,
    });
  });

  it("classifies a 500 JSON response as HTTP", async () => {
    await expect(
      createAuthClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl: async () =>
          jsonResponse(
            { error: "Server failed" },
            { status: 500 },
          ),
      }).fetchSession(),
    ).rejects.toMatchObject({
      name: "AuthClientError",
      kind: "http",
      status: 500,
      message: "Server failed",
    });
  });

  it.each([
    {
      status: 500,
      body: "<html>failed</html>",
      contentType: "text/html",
    },
    {
      status: 403,
      body: "Forbidden",
      contentType: "text/plain",
    },
    {
      status: 401,
      body: "",
      contentType: "text/plain",
    },
  ])(
    "classifies a $status non-JSON response as HTTP",
    async ({
      status,
      body,
      contentType,
    }) => {
      await expect(
        createAuthClient({
          apiOrigin:
            "https://zoeskoul.com",
          fetchImpl: async () =>
            new Response(body, {
              status,
              headers: {
                "Content-Type":
                  contentType,
              },
            }),
        }).fetchSession(),
      ).rejects.toMatchObject({
        name: "AuthClientError",
        kind: "http",
        status,
        message: `API request failed with status ${status}.`,
      });
    },
  );

  it("surfaces network failures", async () => {
    await expect(
      createAuthClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }).fetchSession(),
    ).rejects.toMatchObject({
      name: "AuthClientError",
      kind: "network",
      message: "offline",
    });
  });

  it("surfaces malformed JSON", async () => {
    await expect(
      createAuthClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl: async () =>
          new Response("{bad json", {
            status: 200,
          }),
      }).fetchSession(),
    ).rejects.toMatchObject({
      name: "AuthClientError",
      kind: "invalid_json",
    });
  });

  it("surfaces structurally invalid payloads", async () => {
    await expect(
      createAuthClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl: async () =>
          jsonResponse({
            authenticated: true,
            user: null,
            roles: ["student"],
            capabilities: [
              "student:access",
            ],
          }),
      }).fetchSession(),
    ).rejects.toMatchObject({
      name: "AuthClientError",
      kind: "invalid_payload",
    });
  });

  it("does not redirect the browser", async () => {
    const replace = vi.fn();
    Object.defineProperty(
      globalThis,
      "window",
      {
        value: {
          location: {
            replace,
          },
        },
        configurable: true,
      },
    );

    await expect(
      createAuthClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl: async () =>
          jsonResponse({
            authenticated: false,
            user: null,
            roles: [],
            capabilities: [],
          }),
      }).fetchSession(),
    ).resolves.toMatchObject({
      authenticated: false,
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the exported error type stable", () => {
    const error = new AuthClientError({
      message: "Failed",
      kind: "http",
      status: 403,
    });

    expect(error.kind).toBe("http");
    expect(error.status).toBe(403);
  });
});

describe("buildAuthenticateUrl", () => {
  it("preserves a Student deep-link query and hash in the callback parameter", () => {
    const callbackUrl =
      "http://localhost:3002/en/subjects/python-data-functions/modules?tab=practice#functions";
    const authenticateUrl = new URL(
      buildAuthenticateUrl({
        websiteOrigin:
          "http://localhost:3000",
        callbackUrl,
        locale: "en",
      }),
    );

    expect(authenticateUrl.origin).toBe(
      "http://localhost:3000",
    );
    expect(authenticateUrl.pathname).toBe(
      "/en/authenticate",
    );
    expect(
      authenticateUrl.searchParams.get(
        "callbackUrl",
      ),
    ).toBe(callbackUrl);
  });
});

describe("buildLogoutUrl", () => {
  it("targets the centralized Web logout without provider metadata", () => {
    const logoutUrl = new URL(
      buildLogoutUrl({
        websiteOrigin:
          "http://localhost:3000",
        locale: "fr",
      }),
    );

    expect(logoutUrl.origin).toBe(
      "http://localhost:3000",
    );
    expect(logoutUrl.pathname).toBe(
      "/api/auth/logout",
    );
    expect(
      logoutUrl.searchParams.get(
        "postLogoutRedirect",
      ),
    ).toBe("http://localhost:3000/fr");
    expect(
      logoutUrl.searchParams.get("locale"),
    ).toBe("fr");
    expect(logoutUrl.search).not.toContain(
      "provider",
    );
    expect(logoutUrl.search).not.toContain(
      "token",
    );
  });

  it("normalizes invalid locales to the English Web home", () => {
    const logoutUrl = new URL(
      buildLogoutUrl({
        websiteOrigin:
          "https://zoeskoul.com/some/path",
        locale: "javascript:alert(1)",
      }),
    );

    expect(logoutUrl.origin).toBe(
      "https://zoeskoul.com",
    );
    expect(
      logoutUrl.searchParams.get(
        "postLogoutRedirect",
      ),
    ).toBe("https://zoeskoul.com/en");
    expect(
      logoutUrl.searchParams.get("locale"),
    ).toBe("en");
  });
});
