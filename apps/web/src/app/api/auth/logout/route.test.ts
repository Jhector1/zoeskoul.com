import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  getToken: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
  signOut: mocks.signOut,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: mocks.findFirst,
    },
  },
}));

function makeLogoutRequest(
  query =
    "?postLogoutRedirect=http%3A%2F%2Flocalhost%3A3000%2Fen&locale=en",
) {
  return new NextRequest(
    `http://localhost:3000/api/auth/logout${query}`,
    {
      headers: {
        Referer:
          "http://localhost:3002/en/subjects",
      },
    },
  );
}

function makeAppSessionRequest() {
  return new Request(
    "http://localhost:3000/api/app-session",
    {
      headers: {
        Origin: "http://localhost:3002",
      },
    },
  );
}

async function loadLogoutRoute() {
  vi.resetModules();
  return import("./route");
}

describe("GET /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv(
      "KEYCLOAK_ISSUER",
      "https://accounts.example/realms/zoeskoul",
    );
    vi.stubEnv(
      "KEYCLOAK_CLIENT_ID",
      "zoeskoul-web",
    );
    mocks.getToken.mockResolvedValue(null);
    mocks.signOut.mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    mocks.auth.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("clears a Google session without calling Keycloak", async () => {
    mocks.getToken.mockResolvedValue({
      provider: "google",
      kc_id_token: "must-not-leak",
    });

    const { GET } =
      await loadLogoutRoute();
    const response = await GET(
      makeLogoutRequest(),
    );

    expect(mocks.signOut).toHaveBeenCalledWith({
      redirect: false,
      redirectTo:
        "http://localhost:3000/en",
    });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/en",
    );
    expect(
      response.headers.get("location"),
    ).not.toContain("must-not-leak");
  });

  it("ignores browser-supplied provider tokens", async () => {
    mocks.getToken.mockResolvedValue({
      provider: "google",
    });

    const { GET } =
      await loadLogoutRoute();
    const response = await GET(
      makeLogoutRequest(
        "?postLogoutRedirect=http%3A%2F%2Flocalhost%3A3000%2Fen&locale=en&id_token_hint=browser-token",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/en",
    );
    expect(
      response.headers.get("location"),
    ).not.toContain("browser-token");
  });

  it("clears a Keycloak session before building end-session", async () => {
    mocks.getToken.mockResolvedValue({
      provider: "keycloak",
      kc_id_token: "server-token",
    });

    const { GET } =
      await loadLogoutRoute();
    const response = await GET(
      makeLogoutRequest(),
    );
    const location = new URL(
      response.headers.get("location")!,
    );

    expect(
      mocks.getToken.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0],
    );
    expect(location.origin).toBe(
      "https://accounts.example",
    );
    expect(location.searchParams.get(
      "id_token_hint",
    )).toBe("server-token");
    expect(location.searchParams.get(
      "post_logout_redirect_uri",
    )).toBe("http://localhost:3000/en");
  });

  it("keeps local logout successful when Keycloak metadata is missing", async () => {
    mocks.getToken.mockResolvedValue({
      provider: "keycloak",
    });
    vi.stubEnv("KEYCLOAK_ISSUER", "");

    const { GET } =
      await loadLogoutRoute();
    const response = await GET(
      makeLogoutRequest(),
    );

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/en",
    );
  });

  it.each([
    [{ provider: "other" }, "unknown"],
    [null, "signed-out"],
  ] as const)(
    "makes %s logout safe and idempotent",
    async (token, _expectedProvider) => {
      mocks.getToken.mockResolvedValue(token);
      const { GET } =
        await loadLogoutRoute();

      const first = await GET(
        makeLogoutRequest(),
      );
      const second = await GET(
        makeLogoutRequest(),
      );

      expect(mocks.signOut).toHaveBeenCalledTimes(2);
      expect(first.headers.get("location")).toBe(
        "http://localhost:3000/en",
      );
      expect(second.headers.get("location")).toBe(
        "http://localhost:3000/en",
      );
    },
  );

  it("still clears the session when JWT metadata cannot be read", async () => {
    mocks.getToken.mockRejectedValue(
      new Error("bad cookie"),
    );

    const { GET } =
      await loadLogoutRoute();
    const response = await GET(
      makeLogoutRequest(),
    );

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/en",
    );
  });

  it("rejects an unsafe Student-supplied redirect", async () => {
    const { GET } =
      await loadLogoutRoute();
    const response = await GET(
      makeLogoutRequest(
        "?postLogoutRedirect=https%3A%2F%2Fevil.example&locale=fr",
      ),
    );

    expect(mocks.signOut).toHaveBeenCalledWith({
      redirect: false,
      redirectTo:
        "http://localhost:3000/fr",
    });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/fr",
    );
  });

  it("makes the next app-session bootstrap unauthenticated", async () => {
    let currentSession: unknown = {
      user: {
        id: "student-1",
        email: "student@example.com",
      },
    };

    mocks.auth.mockImplementation(
      async () => currentSession,
    );
    mocks.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student@example.com",
      name: "Student",
      image: null,
      roles: ["student"],
    });
    mocks.getToken.mockResolvedValue({
      provider: "google",
    });
    mocks.signOut.mockImplementation(
      async () => {
        currentSession = null;
        return new Response(null, {
          status: 200,
        });
      },
    );

    const logoutRoute =
      await loadLogoutRoute();
    const appSessionRoute =
      await import("../../app-session/route");
    const before = await appSessionRoute.GET(
      makeAppSessionRequest(),
    );

    expect(await before.json()).toMatchObject({
      authenticated: true,
    });

    await logoutRoute.GET(
      makeLogoutRequest(),
    );

    const after = await appSessionRoute.GET(
      makeAppSessionRequest(),
    );

    await expect(after.json()).resolves.toEqual({
      authenticated: false,
      user: null,
      roles: [],
      capabilities: [],
    });
  });
});
