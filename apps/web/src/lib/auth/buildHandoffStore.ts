import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveRoleCapabilities } from "@/lib/access/roleCapabilities";
import { getBuildHandoffRedisReady } from "./buildHandoffRedis";
import type { AppSessionResponse } from "@zoeskoul/api-contracts";
import {
  BUILD_SESSION_SECONDS, HANDOFF_TICKET_SECONDS, constantTimeEqual,
  isOpaque, isSha256, randomOpaque, sha256,
} from "./buildHandoffProtocol";

const TICKET_PREFIX = "zoeskoul:build-handoff:v1:ticket:";
const SESSION_PREFIX = "zoeskoul:build-handoff:v1:session:";
const USER_PREFIX = "zoeskoul:build-handoff:v1:user:";
const EPOCH_PREFIX = "zoeskoul:build-handoff:v1:epoch:";

export const EMPTY_BUILD_SESSION: AppSessionResponse = {
  authenticated: false, user: null, roles: [], capabilities: [],
};

export async function issueBuildHandoff(args: {
  userId: string; state: string;
}): Promise<string> {
  if (!isSha256(args.state) || !args.userId.trim()) throw new Error("Invalid handoff request");
  const redis = await getBuildHandoffRedisReady();
  // Bound authenticated ticket creation; never issue unbounded login challenges.
  const count = await redis.incr(USER_PREFIX + args.userId + ":issue-rate");
  await redis.expire(USER_PREFIX + args.userId + ":issue-rate", 60);
  if (count > 30) throw new Error("Too many handoff attempts");
  const ticket = randomOpaque();
  const saved = await redis.set(
    TICKET_PREFIX + sha256(ticket),
    JSON.stringify({ userId: args.userId, state: args.state,
      epoch: (await redis.get(EPOCH_PREFIX + args.userId)) ?? "0" }),
    "EX", HANDOFF_TICKET_SECONDS, "NX",
  );
  if (saved !== "OK") throw new Error("Handoff ticket allocation failed");
  return ticket;
}

export async function exchangeBuildHandoff(args: {
  ticket: string; state: string; sessionHash: string;
}): Promise<boolean> {
  if (!isOpaque(args.ticket) || !isSha256(args.state) || !isSha256(args.sessionHash)) return false;
  const redis = await getBuildHandoffRedisReady();
  // GETDEL atomically consumes the ticket, including for invalid exchange attempts.
  const raw = await redis.getdel(TICKET_PREFIX + sha256(args.ticket));
  if (!raw) return false;
  let record: { userId: string; state: string; epoch: string };
  try { record = JSON.parse(raw) as { userId: string; state: string; epoch: string }; }
  catch { return false; }
  if (!record.userId || !constantTimeEqual(record.state, args.state) ||
      record.epoch !== ((await redis.get(EPOCH_PREFIX + record.userId)) ?? "0")) return false;
  const account = await prisma.user.findUnique({ where: { id: record.userId }, select: { id: true } });
  if (!account) return false;
  const sessionKey = SESSION_PREFIX + args.sessionHash;
  const result = await redis.set(sessionKey, JSON.stringify({ userId: account.id, epoch: record.epoch }),
    "EX", BUILD_SESSION_SECONDS, "NX");
  if (result !== "OK") return false;
  // User index supports immediate logout revocation without a schema change.
  try {
    await redis.sadd(USER_PREFIX + account.id, args.sessionHash);
    await redis.expire(USER_PREFIX + account.id, BUILD_SESSION_SECONDS + 60);
  } catch (error) {
    await redis.del(sessionKey);
    throw error;
  }
  return true;
}

export async function readBuildHandoffSession(sessionHash: string): Promise<AppSessionResponse> {
  if (!isSha256(sessionHash)) return EMPTY_BUILD_SESSION;
  const redis = await getBuildHandoffRedisReady();
  const raw = await redis.get(SESSION_PREFIX + sessionHash);
  if (!raw) return EMPTY_BUILD_SESSION;
  let record: { userId: string; epoch: string };
  try { record = JSON.parse(raw) as { userId: string; epoch: string }; }
  catch { return EMPTY_BUILD_SESSION; }
  if (!record.userId || record.epoch !== ((await redis.get(EPOCH_PREFIX + record.userId)) ?? "0")) {
    await redis.del(SESSION_PREFIX + sessionHash);
    return EMPTY_BUILD_SESSION;
  }
  const user = await prisma.user.findUnique({
    where: { id: record.userId }, select: { id: true, email: true, name: true, image: true, roles: true },
  });
  if (!user) {
    await redis.del(SESSION_PREFIX + sessionHash);
    return EMPTY_BUILD_SESSION;
  }
  const access = resolveRoleCapabilities(user.roles);
  return {
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, image: user.image },
    roles: access.appRoles,
    capabilities: access.capabilities,
  };
}

export async function revokeBuildHandoffSession(sessionHash: string): Promise<void> {
  if (!isSha256(sessionHash)) return;
  const redis = await getBuildHandoffRedisReady();
  const raw = await redis.get(SESSION_PREFIX + sessionHash);
  await redis.del(SESSION_PREFIX + sessionHash);
  if (raw) {
    try {
      const session = JSON.parse(raw) as { userId: string };
      if (session.userId) await redis.srem(USER_PREFIX + session.userId, sessionHash);
    } catch { /* Invalid sessions are already deleted. */ }
  }
}

export async function revokeUserBuildSessions(userId: string): Promise<void> {
  if (!userId) return;
  const redis = await getBuildHandoffRedisReady();
  // Epoch increment revokes even sessions racing with logout/index maintenance.
  await redis.incr(EPOCH_PREFIX + userId);
  await redis.expire(EPOCH_PREFIX + userId, BUILD_SESSION_SECONDS + HANDOFF_TICKET_SECONDS + 120);
  const members = await redis.smembers(USER_PREFIX + userId);
  if (members.length) await redis.del(...members.map((member) => SESSION_PREFIX + member));
  await redis.del(USER_PREFIX + userId);
}

/** Extend an existing, already-authorized session without issuing a new login.
 * Redis Lua renews the lease and its logout-revocation index atomically, after
 * checking the epoch and session membership. It never recreates an expired key.
 */
export async function renewBuildHandoffSession(sessionHash: string): Promise<AppSessionResponse> {
  if (!isSha256(sessionHash)) return EMPTY_BUILD_SESSION;
  const session = await readBuildHandoffSession(sessionHash);
  if (!session.authenticated || !session.user?.id) return EMPTY_BUILD_SESSION;
  const redis = await getBuildHandoffRedisReady();
  const userId = session.user.id;
  const renewed = await redis.eval(
    `local raw = redis.call('GET', KEYS[1])
     if not raw then return 0 end
     local ok, record = pcall(cjson.decode, raw)
     if not ok or type(record) ~= 'table' or record.userId ~= ARGV[2] then return 0 end
     local epoch = redis.call('GET', KEYS[3]) or '0'
     if record.epoch ~= epoch then return 0 end
     if redis.call('SISMEMBER', KEYS[2], ARGV[1]) ~= 1 then return 0 end
     if redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) ~= 1 then return 0 end
     if redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]) + 60) ~= 1 then return 0 end
     return 1`,
    3,
    SESSION_PREFIX + sessionHash,
    USER_PREFIX + userId,
    EPOCH_PREFIX + userId,
    sessionHash, userId, BUILD_SESSION_SECONDS,
  );
  if (renewed !== 1) return EMPTY_BUILD_SESSION;
  // A concurrent logout may have happened immediately after the Lua script;
  // the authority must still validate identity/epoch before reporting success.
  return readBuildHandoffSession(sessionHash);
}
