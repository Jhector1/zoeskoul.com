import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { RunSessionState } from "@zoeskoul/code-contracts";
import { getServerRedisReady } from "@/lib/server/redis";

export type PtySessionLease = {
    sessionId: string;
    actorKey: string;
    workspaceKey: string;
    state: RunSessionState;
    createdAt: number;
    lastSeenAt: number;
    expiresAt: number;
};

const PREFIX = process.env.PTY_SESSION_REDIS_PREFIX || "zoeskoul:pty:v1";

function leaseTtlMs() {
    const raw = Number(process.env.PTY_SESSION_LEASE_TTL_MS);
    return Number.isFinite(raw) && raw >= 30_000 ? raw : 5 * 60 * 1000;
}

function lockTtlMs() {
    const raw = Number(process.env.PTY_SESSION_LOCK_TTL_MS);
    return Number.isFinite(raw) && raw >= 2_000 ? raw : 10_000;
}

function nowMs() {
    return Date.now();
}

function sha(input: string) {
    return createHash("sha256").update(input).digest("hex");
}

export function normalizeWorkspaceKey(input: unknown): string | null {
    if (typeof input !== "string") return null;

    const value = input.replace(/\s+/g, " ").trim();

    if (!value) return null;

    return value.slice(0, 500);
}

function actorHash(actorKey: string) {
    return sha(actorKey);
}

function workspaceHash(actorKey: string, workspaceKey: string) {
    return sha(`${actorKey}\0${workspaceKey}`);
}

function actorSessionSetKey(actorKey: string) {
    return `${PREFIX}:actor:${actorHash(actorKey)}:sessions`;
}

function workspaceLeaseKey(actorKey: string, workspaceKey: string) {
    return `${PREFIX}:workspace:${workspaceHash(actorKey, workspaceKey)}`;
}

function sessionLeaseKey(sessionId: string) {
    return `${PREFIX}:session:${sessionId}`;
}

function lockKey(actorKey: string, workspaceKey: string) {
    return `${PREFIX}:lock:${workspaceHash(actorKey, workspaceKey)}`;
}

function parseLease(raw: string | null): PtySessionLease | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as PtySessionLease;

        if (!parsed.sessionId || !parsed.actorKey || !parsed.workspaceKey) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

function isExpired(lease: PtySessionLease) {
    return lease.expiresAt <= nowMs();
}

function freshLease(lease: PtySessionLease): PtySessionLease {
    const now = nowMs();

    return {
        ...lease,
        lastSeenAt: now,
        expiresAt: now + leaseTtlMs(),
    };
}

async function writeLease(lease: PtySessionLease): Promise<void> {
    const redis = await getServerRedisReady();
    const ttl = leaseTtlMs();
    const json = JSON.stringify(lease);
    const actorSetKey = actorSessionSetKey(lease.actorKey);

    await redis
        .multi()
        .set(workspaceLeaseKey(lease.actorKey, lease.workspaceKey), json, "PX", ttl)
        .set(sessionLeaseKey(lease.sessionId), json, "PX", ttl)
        .sadd(actorSetKey, lease.sessionId)
        .pexpire(actorSetKey, ttl)
        .exec();
}

export async function getPtyLeaseByWorkspace(args: {
    actorKey: string;
    workspaceKey: string;
}): Promise<PtySessionLease | null> {
    const redis = await getServerRedisReady();

    const key = workspaceLeaseKey(args.actorKey, args.workspaceKey);
    const raw = await redis.get(key);
    const lease = parseLease(raw);

    if (!lease) return null;

    if (
        lease.actorKey !== args.actorKey ||
        lease.workspaceKey !== args.workspaceKey ||
        isExpired(lease)
    ) {
        await forgetPtyLeaseBySession({
            actorKey: args.actorKey,
            sessionId: lease.sessionId,
        }).catch(() => {});
        return null;
    }

    const touched = freshLease(lease);
    await writeLease(touched);

    return touched;
}

export async function listPtyLeasesByActor(args: {
    actorKey: string;
}): Promise<PtySessionLease[]> {
    const redis = await getServerRedisReady();
    const actorSetKey = actorSessionSetKey(args.actorKey);
    const ids = await redis.smembers(actorSetKey);
    const leases: PtySessionLease[] = [];

    for (const sessionId of ids) {
        const raw = await redis.get(sessionLeaseKey(sessionId));
        const lease = parseLease(raw);

        if (!lease || lease.actorKey !== args.actorKey || isExpired(lease)) {
            await forgetPtyLeaseBySession({
                actorKey: args.actorKey,
                sessionId,
            }).catch(() => {});
            continue;
        }

        leases.push(lease);
    }

    return leases;
}

export async function rememberPtyLease(args: {
    actorKey: string;
    workspaceKey: string;
    sessionId: string;
    state: RunSessionState;
}): Promise<PtySessionLease> {
    const redis = await getServerRedisReady();
    const ttl = leaseTtlMs();
    const now = nowMs();

    const next: PtySessionLease = {
        actorKey: args.actorKey,
        workspaceKey: args.workspaceKey,
        sessionId: args.sessionId,
        state: args.state,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + ttl,
    };

    const workspaceKeyName = workspaceLeaseKey(args.actorKey, args.workspaceKey);
    const previous = parseLease(await redis.get(workspaceKeyName));
    const actorSetKey = actorSessionSetKey(args.actorKey);
    const json = JSON.stringify(next);
    const multi = redis.multi();

    if (previous?.sessionId && previous.sessionId !== args.sessionId) {
        multi.del(sessionLeaseKey(previous.sessionId));
        multi.srem(actorSetKey, previous.sessionId);
    }

    multi.set(workspaceKeyName, json, "PX", ttl);
    multi.set(sessionLeaseKey(args.sessionId), json, "PX", ttl);
    multi.sadd(actorSetKey, args.sessionId);
    multi.pexpire(actorSetKey, ttl);

    await multi.exec();

    return next;
}

export async function touchPtyLeaseBySession(args: {
    actorKey: string;
    sessionId: string;
}): Promise<boolean> {
    const redis = await getServerRedisReady();

    const raw = await redis.get(sessionLeaseKey(args.sessionId));
    const lease = parseLease(raw);

    if (!lease) return false;

    if (lease.actorKey !== args.actorKey || isExpired(lease)) {
        await forgetPtyLeaseBySession(args).catch(() => {});
        return false;
    }

    const touched = freshLease(lease);
    await writeLease(touched);

    return true;
}

export async function forgetPtyLeaseBySession(args: {
    actorKey?: string;
    sessionId: string;
}): Promise<boolean> {
    const redis = await getServerRedisReady();

    const raw = await redis.get(sessionLeaseKey(args.sessionId));
    const lease = parseLease(raw);

    if (!lease) {
        await redis.del(sessionLeaseKey(args.sessionId));
        if (args.actorKey) {
            await redis.srem(actorSessionSetKey(args.actorKey), args.sessionId);
        }
        return false;
    }

    if (args.actorKey && lease.actorKey !== args.actorKey) {
        return false;
    }

    await redis
        .multi()
        .del(sessionLeaseKey(lease.sessionId))
        .del(workspaceLeaseKey(lease.actorKey, lease.workspaceKey))
        .srem(actorSessionSetKey(lease.actorKey), lease.sessionId)
        .exec();

    return true;
}

export async function acquirePtyLeaseLock(args: {
    actorKey: string;
    workspaceKey: string;
}): Promise<{ key: string; token: string } | null> {
    const redis = await getServerRedisReady();

    const key = lockKey(args.actorKey, args.workspaceKey);
    const token = randomUUID();

    const out = await redis.set(key, token, "PX", lockTtlMs(), "NX");

    if (out !== "OK") return null;

    return { key, token };
}

export async function releasePtyLeaseLock(lock: {
    key: string;
    token: string;
}): Promise<void> {
    const redis = await getServerRedisReady();

    await redis.eval(
        `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        end
        return 0
        `,
        1,
        lock.key,
        lock.token,
    );
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPtyLeaseByWorkspace(args: {
    actorKey: string;
    workspaceKey: string;
    attempts?: number;
    delayMs?: number;
}): Promise<PtySessionLease | null> {
    const attempts = args.attempts ?? 12;
    const delayMs = args.delayMs ?? 150;

    for (let i = 0; i < attempts; i += 1) {
        const lease = await getPtyLeaseByWorkspace({
            actorKey: args.actorKey,
            workspaceKey: args.workspaceKey,
        });

        if (lease) return lease;

        await sleep(delayMs);
    }

    return null;
}
