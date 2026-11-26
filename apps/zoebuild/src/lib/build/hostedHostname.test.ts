import assert from "node:assert/strict";
import { test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { PrismaClient } from "@zoeskoul/db";
import { hostedTitleLabel, reserveHostedHostname, HOSTED_DEV_DOMAIN } from "./hostedHostname";

const env: Record<string, string | undefined> = process.env;

function enabled() {
  const keys = ["NODE_ENV", "VERCEL_ENV", "ZOEBUILD_PUBLISH_ENABLED", "ZOEBUILD_HOSTED_HOSTNAMES_ENABLED"] as const;
  const old = keys.map(k => env[k]);
  Object.assign(env, { NODE_ENV: "development", VERCEL_ENV: "development",
    ZOEBUILD_PUBLISH_ENABLED: "0", ZOEBUILD_HOSTED_HOSTNAMES_ENABLED: "1" });
  return () => keys.forEach((k, i) => old[i] === undefined ? delete env[k] : void (env[k] = old[i]));
}
function fixture() {
  const projects = new Map([ ["a", { owner: "alice", title: "Coffee Store", archived: false, stack: "tanstack-start-v1" }],
    ["b", { owner: "bob", title: "Coffee Store", archived: false, stack: "tanstack-start-v1" }] ]);
  const rows = new Map<string, string | null>();
  const state = { calls: 0, conflict: 0, fault: "P2034" };
  const client = { async $transaction(fn: (tx: unknown) => Promise<unknown>, options: {isolationLevel: string}) {
    state.calls++; assert.equal(options.isolationLevel, "Serializable");
    if (state.conflict > 0) { state.conflict--; throw { code: state.fault }; }
    return fn({ buildProject: { async findFirst({where}: any) {
      const p = projects.get(where.id);
      assert.equal(where.status.not, "archived"); assert.equal(where.codeProject.archivedAt, null);
      return p && !p.archived && p.owner === where.codeProject.ownerId && p.stack === where.stackId
        ? { id: where.id, codeProject: { title: p.title } } : null;
    } }, buildHostedHostname: {
      async findUnique({where}: any) { for (const [hostname, id] of rows) if (id === where.buildProjectId) return { hostname }; return null; },
      async create({data}: any) { if (rows.has(data.hostname) || [...rows.values()].includes(data.buildProjectId)) throw { code: "P2002" };
        rows.set(data.hostname, data.buildProjectId); return { hostname: data.hostname }; },
    } });
  } } as unknown as PrismaClient;
  const a = () => reserveHostedHostname(client, {ownerId: "alice", buildProjectId: "a"});
  const b = () => reserveHostedHostname(client, {ownerId: "bob", buildProjectId: "b"});
  return { client, projects, rows, state, a, b };
}
function run(name: string, fn: (f: ReturnType<typeof fixture>) => Promise<void>) {
  test(name, async () => { const restore = enabled(); try { await fn(fixture()); } finally { restore(); } });
}
test("safe title labels and reserved names", () => {
  assert.equal(hostedTitleLabel(" Café & Art "), "cafe-art");
  assert.equal(hostedTitleLabel("a".repeat(100)), "a".repeat(48));
  for (const title of ["ADMIN", "www", "site-abc", "ns42", "!!!", "日本語", "xn--test"]) assert.equal(hostedTitleLabel(title), null);
  assert.equal(hostedTitleLabel("https://evil.test/a"), "https-evil-test-a");
});
run("first reservation is stable across a title change", async f => {
  const first = await f.a(); assert.equal(first, `coffee-store.${HOSTED_DEV_DOMAIN}`);
  f.projects.get("a")!.title = "New name"; assert.equal(await f.a(), first); assert.equal(f.rows.size, 1);
});
run("same title in a second project does not steal hostname", async f => {
  const first = await f.a(); const second = await f.b(); assert.notEqual(first, second);
  assert.match(second, /^site-[a-f0-9]{24}\.sites\.zoebuild\.test$/); assert.equal(await f.b(), second);
});
run("unauthorized and missing projects cannot reserve or read", async f => {
  await f.a(); await assert.rejects(reserveHostedHostname(f.client, {ownerId: "bob", buildProjectId: "a"}), /NOT_FOUND/);
  await assert.rejects(reserveHostedHostname(f.client, {ownerId: "alice", buildProjectId: "missing"}), /NOT_FOUND/); assert.equal(f.rows.size, 1);
});
run("archived and unsupported stack projects are denied", async f => {
  f.projects.get("a")!.archived = true; await assert.rejects(f.a(), /NOT_FOUND/);
  f.projects.get("b")!.stack = "legacy"; await assert.rejects(f.b(), /NOT_FOUND/); assert.equal(f.rows.size, 0);
});
run("deleted project hostname tombstone is not recycled", async f => {
  const first = await f.a(); f.rows.set(first, null); f.projects.delete("a"); assert.notEqual(await f.b(), first); assert.equal(f.rows.get(first), null);
});
run("same project concurrent reservations converge", async f => {
  const [a, b] = await Promise.all([f.a(), f.a()]); assert.equal(a, b); assert.equal(f.rows.size, 1);
});
run("concurrent projects with same title remain distinct", async f => {
  const [a, b] = await Promise.all([f.a(), f.b()]); assert.notEqual(a, b); assert.equal(f.rows.size, 2);
});
run("serialization conflict retries in fresh transaction", async f => {
  f.state.conflict = 2; assert.match(await f.a(), /^site-/); assert.equal(f.state.calls, 3);
});
run("retry bound fails closed", async f => {
  f.state.conflict = 20; await assert.rejects(f.a(), /ALLOCATION_BUSY/); assert.equal(f.state.calls, 6); assert.equal(f.rows.size, 0);
});
run("unrelated database errors are not hidden", async f => {
  f.state.conflict = 1; f.state.fault = "P1001"; await assert.rejects(f.a(), (e: any) => e.code === "P1001"); assert.equal(f.state.calls, 1);
});
run("corrupt existing reservation fails closed", async f => {
  f.rows.set("api.evil.example", "a"); await assert.rejects(f.a(), /INVALID_RESERVATION/); assert.equal(f.rows.size, 1);
});
run("production and disabled gates perform no database work", async f => {
  env.VERCEL_ENV = "production"; await assert.rejects(f.a(), /DISABLED/);
  env.VERCEL_ENV = "development"; env.NODE_ENV = "production"; await assert.rejects(f.a(), /DISABLED/);
  env.NODE_ENV = "development"; env.ZOEBUILD_PUBLISH_ENABLED = "1"; await assert.rejects(f.a(), /DISABLED/);
  env.ZOEBUILD_PUBLISH_ENABLED = "0"; env.ZOEBUILD_HOSTED_HOSTNAMES_ENABLED = "0"; await assert.rejects(f.a(), /DISABLED/); assert.equal(f.state.calls, 0);
});
