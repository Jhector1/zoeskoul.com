import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const keys = new Map<string, string>();
  const userSets = new Map<string, Set<string>>();
  const expiries = new Map<string, number>();
  const redis = {
    async set(key: string, value: string) {
      if (keys.has(key)) return null;
      keys.set(key, value); return "OK";
    },
    async getdel(key: string) { const value = keys.get(key) ?? null; keys.delete(key); return value; },
    async get(key: string) { return keys.get(key) ?? null; },
    async del(...names: string[]) { for (const name of names) keys.delete(name); return names.length; },
    async sadd(key: string, value: string) { const set = userSets.get(key) ?? new Set<string>(); set.add(value); userSets.set(key, set); return 1; },
    async expire(key: string, seconds: number) { expiries.set(key, seconds); return 1; },
    async eval(_source: string, count: number, sessionKey: string, userKey: string,
      epochKey: string, hash: string, userId: string, seconds: number) {
      if (count !== 3) return 0;
      const raw = keys.get(sessionKey);
      if (!raw) return 0;
      const record = JSON.parse(raw) as { userId: string; epoch: string };
      if (record.userId !== userId || record.epoch !== (keys.get(epochKey) ?? "0") ||
          !userSets.get(userKey)?.has(hash)) return 0;
      expiries.set(sessionKey, seconds);
      expiries.set(userKey, seconds + 60);
      return 1;
    },
    async incr(key: string) { const next = Number(keys.get(key) || 0) + 1; keys.set(key, String(next)); return next; },
    async srem(key: string, value: string) { userSets.get(key)?.delete(value); return 1; },
    async smembers(key: string) { return [...(userSets.get(key) ?? [])]; },
  };
  return { keys, userSets, expiries, redis, findUnique: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("./buildHandoffRedis", () => ({ getBuildHandoffRedisReady: async () => mocks.redis }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/access/roleCapabilities", () => ({
  resolveRoleCapabilities: (roles: string[]) => ({ appRoles: roles, capabilities: ["student:access"] }),
}));
import {
  exchangeBuildHandoff, issueBuildHandoff, readBuildHandoffSession,
  renewBuildHandoffSession, revokeBuildHandoffSession, revokeUserBuildSessions,
} from "./buildHandoffStore";
import { BUILD_SESSION_SECONDS, randomOpaque, sha256 } from "./buildHandoffProtocol";

describe("one-use website handoff and revocable builder session", () => {
  beforeEach(() => {
    mocks.keys.clear(); mocks.userSets.clear(); mocks.expiries.clear(); mocks.findUnique.mockReset();
    mocks.findUnique.mockImplementation(async (args: { select: { roles?: boolean } }) =>
      args.select.roles ? { id: "user-1", email: null, name: "User", image: null, roles: ["student"] } : { id: "user-1" });
  });
  it("consumes a ticket atomically, rejects replay, and returns live account permissions", async () => {
    const state = sha256(randomOpaque());
    const ticket = await issueBuildHandoff({ userId: "user-1", state });
    expect(mocks.keys.size).toBe(2); // rate limiter + one hashed ticket
    const sessionHash = sha256(randomOpaque());
    expect(await exchangeBuildHandoff({ ticket, state, sessionHash })).toBe(true);
    expect(await exchangeBuildHandoff({ ticket, state, sessionHash: sha256(randomOpaque()) })).toBe(false);
    const session = await readBuildHandoffSession(sessionHash);
    expect(session.authenticated).toBe(true);
    if (session.authenticated) expect(session.user.id).toBe("user-1");
  });
  it("rejects a mismatched state and burns the ticket", async () => {
    const state = sha256(randomOpaque());
    const ticket = await issueBuildHandoff({ userId: "user-1", state });
    const sessionHash = sha256(randomOpaque());
    expect(await exchangeBuildHandoff({ ticket, state: sha256(randomOpaque()), sessionHash })).toBe(false);
    expect(await exchangeBuildHandoff({ ticket, state, sessionHash })).toBe(false);
  });
  it("rejects malformed tokens without reaching Redis", async () => {
    expect(await exchangeBuildHandoff({ ticket: "a", state: "b", sessionHash: "c" })).toBe(false);
    expect((await readBuildHandoffSession("bad")).authenticated).toBe(false);
  });
  it("supports immediate single-session and whole-account revocation", async () => {
    const state = sha256(randomOpaque());
    const ticket = await issueBuildHandoff({ userId: "user-1", state });
    const sessionHash = sha256(randomOpaque());
    expect(await exchangeBuildHandoff({ ticket, state, sessionHash })).toBe(true);
    await revokeBuildHandoffSession(sessionHash);
    expect((await readBuildHandoffSession(sessionHash)).authenticated).toBe(false);
    const ticket2 = await issueBuildHandoff({ userId: "user-1", state });
    const sessionHash2 = sha256(randomOpaque());
    expect(await exchangeBuildHandoff({ ticket: ticket2, state, sessionHash: sessionHash2 })).toBe(true);
    await revokeUserBuildSessions("user-1");
    expect((await readBuildHandoffSession(sessionHash2)).authenticated).toBe(false);
  });
  it("fails closed when account is deleted", async () => {
    const state = sha256(randomOpaque()); const ticket = await issueBuildHandoff({ userId: "user-1", state });
    const sessionHash = sha256(randomOpaque());
    mocks.findUnique.mockResolvedValueOnce({ id: "user-1" }).mockResolvedValueOnce(null);
    expect(await exchangeBuildHandoff({ ticket, state, sessionHash })).toBe(true);
    expect((await readBuildHandoffSession(sessionHash)).authenticated).toBe(false);
  });
  it("renews Redis session and its logout index together, without issuing a new ticket", async () => {
    const state = sha256(randomOpaque());
    const ticket = await issueBuildHandoff({ userId: "user-1", state });
    const sessionHash = sha256(randomOpaque());
    expect(await exchangeBuildHandoff({ ticket, state, sessionHash })).toBe(true);
    const live = await renewBuildHandoffSession(sessionHash);
    expect(live.authenticated).toBe(true);
    expect(mocks.expiries.get("zoeskoul:build-handoff:v1:session:" + sessionHash))
      .toBe(BUILD_SESSION_SECONDS);
    expect(mocks.expiries.get("zoeskoul:build-handoff:v1:user:user-1"))
      .toBe(BUILD_SESSION_SECONDS + 60);
  });
  it("never renews a revoked or absent session", async () => {
    const state = sha256(randomOpaque());
    const ticket = await issueBuildHandoff({ userId: "user-1", state });
    const hash = sha256(randomOpaque());
    expect(await exchangeBuildHandoff({ ticket, state, sessionHash: hash })).toBe(true);
    await revokeUserBuildSessions("user-1");
    expect((await renewBuildHandoffSession(hash)).authenticated).toBe(false);
    expect((await renewBuildHandoffSession("invalid")).authenticated).toBe(false);
    expect(mocks.expiries.has("zoeskoul:build-handoff:v1:session:" + hash)).toBe(false);
  });

});
