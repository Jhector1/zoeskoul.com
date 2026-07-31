import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: mocks.findFirst,
    },
  },
}));

function makeRequest(origin = "http://localhost:3002") {
  return new Request(
    "http://localhost:3000/api/app-session",
    {
      headers: {
        Origin: origin,
      },
    },
  );
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("GET /api/app-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
  });

  it("returns an unauthenticated browser-safe response", async () => {
    const { GET } = await loadRoute();
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      user: null,
      roles: [],
      capabilities: [],
    });
  });

  it("returns student access from database roles", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "student-1",
        email: "student@example.com",
      },
    });
    mocks.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student@example.com",
      name: "Student",
      image: null,
      roles: ["student"],
    });

    const { GET } = await loadRoute();
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body).toEqual({
      authenticated: true,
      user: {
        id: "student-1",
        email: "student@example.com",
        name: "Student",
        image: null,
      },
      roles: ["student"],
      capabilities: ["student:access"],
    });
  });

  it("preserves teacher inheritance into student access", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "teacher-1",
      },
    });
    mocks.findFirst.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      name: "Teacher",
      image: null,
      roles: ["teacher"],
    });

    const { GET } = await loadRoute();
    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      roles: ["teacher"],
      capabilities: [
        "student:access",
        "teacher:access",
      ],
    });
  });

  it("returns admin access with inherited app capabilities", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "admin-1",
      },
    });
    mocks.findFirst.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      image: "https://cdn.example.com/admin.png",
      roles: ["admin"],
    });

    const { GET } = await loadRoute();
    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      roles: ["admin"],
      capabilities: [
        "student:access",
        "teacher:access",
        "admin:access",
      ],
    });
  });

  it("deduplicates multiple roles", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "teacher-1",
      },
    });
    mocks.findFirst.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      name: "Teacher",
      image: null,
      roles: [
        "teacher",
        "student",
        "teacher",
      ],
    });

    const { GET } = await loadRoute();
    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      roles: ["teacher", "student"],
      capabilities: [
        "student:access",
        "teacher:access",
      ],
    });
  });

  it("treats a missing database user as unauthenticated", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "missing-user",
        email: "missing@example.com",
      },
    });
    mocks.findFirst.mockResolvedValue(null);

    const { GET } = await loadRoute();
    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      user: null,
      roles: [],
      capabilities: [],
    });
  });

  it("reflects a database role change on the next request", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });
    mocks.findFirst
      .mockResolvedValueOnce({
        id: "user-1",
        email: "user@example.com",
        name: "User",
        image: null,
        roles: ["student"],
      })
      .mockResolvedValueOnce({
        id: "user-1",
        email: "user@example.com",
        name: "User",
        image: null,
        roles: ["teacher"],
      });

    const firstRoute = await loadRoute();
    const first = await firstRoute.GET(makeRequest());
    expect(await first.json()).toMatchObject({
      roles: ["student"],
      capabilities: ["student:access"],
    });

    const secondRoute = await loadRoute();
    const second = await secondRoute.GET(makeRequest());
    expect(await second.json()).toMatchObject({
      roles: ["teacher"],
      capabilities: [
        "student:access",
        "teacher:access",
      ],
    });
  });

  it("does not expose provider tokens or server-only fields", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "student-1",
        provider: "keycloak",
      },
      accessToken: "provider-token",
      kc_id_token: "keycloak-id-token",
    });
    mocks.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student@example.com",
      name: "Student",
      image: null,
      roles: ["student"],
      refreshToken: "server-only",
    });

    const { GET } = await loadRoute();
    const response = await GET(makeRequest());
    const serialized = JSON.stringify(
      await response.json(),
    );

    expect(serialized).not.toContain(
      "accessToken",
    );
    expect(serialized).not.toContain(
      "refreshToken",
    );
    expect(serialized).not.toContain(
      "provider-token",
    );
    expect(serialized).not.toContain(
      "keycloak",
    );
    expect(serialized).not.toContain(
      "provider",
    );
    expect(serialized).not.toContain(
      "server-only",
    );
  });

  it("preserves credentialed CORS headers", async () => {
    const { GET } = await loadRoute();
    const response = await GET(makeRequest());

    expect(
      response.headers.get(
        "Access-Control-Allow-Origin",
      ),
    ).toBe("http://localhost:3002");
    expect(
      response.headers.get(
        "Access-Control-Allow-Credentials",
      ),
    ).toBe("true");
    expect(
      response.headers.get(
        "Cache-Control",
      ),
    ).toBe("no-store, max-age=0");
    expect(
      response.headers.get("Vary"),
    ).toContain("Origin");
    expect(
      response.headers.get("Vary"),
    ).toContain("Cookie");
  });

  it("rejects a forbidden origin without credentialed CORS headers", async () => {
    const { GET } = await loadRoute();
    const response = await GET(
      makeRequest(
        "https://malicious.example.com",
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden",
    });
    expect(
      response.headers.get(
        "Access-Control-Allow-Origin",
      ),
    ).toBeNull();
    expect(
      response.headers.get(
        "Access-Control-Allow-Credentials",
      ),
    ).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
