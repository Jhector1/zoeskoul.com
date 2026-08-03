import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  serializePreferencesCookieValue,
} from "@zoeskoul/preferences";

const mocks = vi.hoisted(() => ({
  getCurrentUserAccess: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/access/currentUserAccess", () => ({
  getCurrentUserAccess: mocks.getCurrentUserAccess,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userPreferences: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

const defaults = {
  locale: "en",
  theme: "system",
  fontSizePx: 16,
  soundEnabled: true,
} as const;

const stored = {
  locale: "fr",
  theme: "dark",
  fontSizePx: 20,
  soundEnabled: false,
} as const;

function request(args: {
  method?: string;
  origin?: string | null;
  cookie?: string;
  body?: unknown;
  url?: string;
} = {}) {
  const headers = new Headers();
  if (args.origin !== null) {
    headers.set("Origin", args.origin ?? "http://localhost:3002");
  }
  if (args.cookie) headers.set("Cookie", args.cookie);
  if (args.body !== undefined) headers.set("Content-Type", "application/json");

  return new Request(
    args.url ?? "http://localhost:3000/api/app-preferences",
    {
    method: args.method ?? "GET",
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    },
  );
}

async function route() {
  vi.resetModules();
  return import("./route");
}

function authenticate(userId = "user-1") {
  mocks.getCurrentUserAccess.mockResolvedValue({
    authenticated: true,
    user: {
      id: userId,
      email: `${userId}@example.com`,
      name: userId,
      image: null,
    },
    capabilities: {
      appRoles: [],
      capabilities: [],
    },
  });
}

describe("/api/app-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserAccess.mockResolvedValue({
      authenticated: false,
      user: null,
      capabilities: {
        appRoles: [],
        capabilities: [],
      },
    });
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(stored);
  });

  it("returns authenticated database preferences and mirrors cookies", async () => {
    authenticate();
    mocks.findUnique.mockResolvedValue(stored);
    const { GET } = await route();
    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      preferences: stored,
      source: "database",
    });
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
    expect(response.headers.get("set-cookie")).toContain(
      `zoeskoul.preferences=${serializePreferencesCookieValue(stored)}`,
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses an anonymous cookie and defaults a missing authenticated row", async () => {
    const { GET } = await route();
    const anonymous = await GET(request({
      cookie:
        `zoeskoul.preferences=${serializePreferencesCookieValue(stored)}`,
    }));
    await expect(anonymous.json()).resolves.toEqual({
      authenticated: false,
      preferences: stored,
      source: "cookie",
    });

    authenticate();
    mocks.findUnique.mockResolvedValue(null);
    const missing = await GET(request());
    await expect(missing.json()).resolves.toEqual({
      authenticated: true,
      preferences: defaults,
      source: "database",
    });
  });

  it("requires authentication for PATCH", async () => {
    const { PATCH } = await route();
    const response = await PATCH(request({
      method: "PATCH",
      body: { theme: "dark" },
    }));
    expect(response.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("strictly applies a partial PATCH using the server user ID", async () => {
    authenticate("trusted-user");
    const { PATCH } = await route();
    const response = await PATCH(request({
      method: "PATCH",
      body: { theme: "dark" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "trusted-user" },
        create: expect.objectContaining({
          userId: "trusted-user",
          theme: "dark",
        }),
        update: { theme: "dark" },
      }),
    );
    expect(response.headers.get("set-cookie")).toContain(
      "zoeskoul.preferences=v1.fr.d.20.0",
    );
  });

  it.each([
    [{ theme: "sepia" }, "Invalid theme."],
    [{ fontSizePx: 18 }, "Invalid font size."],
    [{ soundEnabled: "false" }, "Invalid sound preference."],
    [{ userId: "spoof", theme: "dark" }, "Unknown preference field"],
  ])("rejects invalid PATCH %#", async (body, message) => {
    authenticate();
    const { PATCH } = await route();
    const response = await PATCH(request({ method: "PATCH", body }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(message);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("forbids untrusted and missing mutation origins", async () => {
    authenticate();
    const { PATCH } = await route();
    for (const origin of ["https://evil.example", null]) {
      const response = await PATCH(request({
        method: "PATCH",
        origin,
        body: { theme: "dark" },
      }));
      expect(response.status).toBe(403);
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each(["student-1", "teacher-1", "admin-1"])(
    "is role-independent for %s",
    async (userId) => {
      authenticate(userId);
      const { PATCH } = await route();
      const response = await PATCH(request({
        method: "PATCH",
        body: { soundEnabled: false },
      }));
      expect(response.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
      mocks.upsert.mockClear();
    },
  );

  it("never leaks identity or modifies an auth cookie", async () => {
    authenticate("private-user");
    mocks.findUnique.mockResolvedValue(stored);
    const { GET } = await route();
    const response = await GET(request());
    const body = JSON.stringify(await response.json());
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(body).not.toContain("private-user");
    expect(body).not.toContain("@example.com");
    expect(setCookie).not.toMatch(/authjs|session-token/i);
  });

  it("uses cross-subdomain production cookie attributes without HttpOnly", async () => {
    const { GET } = await route();
    const response = await GET(request({
      url: "https://zoeskoul.com/api/app-preferences",
      origin: "https://student.zoeskoul.com",
    }));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(setCookie).toContain("Domain=zoeskoul.com");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toContain("HttpOnly");
  });

  it("lets an anonymous browser safely establish its display cookie", async () => {
    const { POST } = await route();
    const response = await POST(request({
      method: "POST",
      body: stored,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      preferences: stored,
      source: "cookie",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
