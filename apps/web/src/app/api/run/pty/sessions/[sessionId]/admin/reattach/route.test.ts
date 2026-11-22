import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getActor: vi.fn(), actorKeyOf: vi.fn(), requireRunnerActorKey: vi.fn(),
  runnerPost: vi.fn(), createAttachToken: vi.fn(), getRunnerWsBase: vi.fn(),
  authorizeStudentAdminLab: vi.fn(), parseStudentAdminLabTarget: vi.fn(),
  RunnerHttpError: class RunnerHttpError extends Error {
    constructor(public readonly status: number) { super("PRIVATE_RUNNER_ERROR"); }
  },
}));
vi.mock("next/server", () => ({ NextResponse: { json(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), init);
} } }));
vi.mock("@/lib/practice/actor", () => ({ getActor: mocks.getActor, actorKeyOf: mocks.actorKeyOf }));
vi.mock("@/lib/server/runnerActorKey", () => ({ requireRunnerActorKey: mocks.requireRunnerActorKey }));
vi.mock("@/lib/server/runnerClient", () => ({ runnerPost: mocks.runnerPost, RunnerHttpError: mocks.RunnerHttpError }));
vi.mock("@/lib/server/ptyAttachToken", () => ({ createAttachToken: mocks.createAttachToken }));
vi.mock("@/lib/server/runnerWsBase", () => ({ getRunnerWsBase: mocks.getRunnerWsBase }));
vi.mock("@/lib/learning/server/authorizeStudentAdminLab", () => ({ authorizeStudentAdminLab: mocks.authorizeStudentAdminLab }));
vi.mock("@/lib/learning/server/learningAdminStudentPolicy", () => ({ parseStudentAdminLabTarget: mocks.parseStudentAdminLabTarget }));
import { POST } from "./route";
const origin = "http://localhost:3000";
const sid = "sess_11111111-1111-4111-8111-111111111111";
const actor = `u:${"a".repeat(64)}`;
const target = { moduleSlug: "zoelearning-disposable-root", topicSlug: "full-privileges" };
async function request(opts: { origin?: string | null; sid?: string; body?: string } = {}) {
  const req = new Request(`${origin}/api/run/pty/sessions/${sid}/admin/reattach`, {
    method: "POST", headers: opts.origin === null ? {} : { origin: opts.origin ?? origin }, body: opts.body,
  });
  const res = await POST(req as Parameters<typeof POST>[0], { params: Promise.resolve({ sessionId: opts.sid ?? sid }) });
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  return { status: res.status, body: await res.json() };
}
function noMint() { expect(mocks.createAttachToken).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED", "true");
  vi.stubEnv("ZOESKOUL_LEARNING_WEB_ORIGIN", origin);
  mocks.getActor.mockResolvedValue({ userId: "student", guestId: null });
  mocks.actorKeyOf.mockReturnValue(actor);
  mocks.requireRunnerActorKey.mockResolvedValue(actor);
  mocks.parseStudentAdminLabTarget.mockReturnValue(target);
  mocks.authorizeStudentAdminLab.mockResolvedValue(true);
  mocks.runnerPost.mockResolvedValue({ ok: true, sessionId: sid, state: "waiting_for_input" });
  mocks.createAttachToken.mockReturnValue("TEST_TOKEN");
  mocks.getRunnerWsBase.mockReturnValue("ws://localhost:4001");
});
afterEach(() => vi.unstubAllEnvs());
describe("existing global administrator shell fresh-token route", () => {
  it("requires the student feature flag", async () => { vi.stubEnv("ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED", "false"); expect((await request()).status).toBe(403); noMint(); expect(mocks.getActor).not.toHaveBeenCalled(); });
  it("requires a configured origin", async () => { vi.stubEnv("ZOESKOUL_LEARNING_WEB_ORIGIN", ""); expect((await request()).status).toBe(403); noMint(); });
  it("rejects cross-origin and missing-origin requests", async () => { expect((await request({ origin: "https://foreign.test" })).status).toBe(403); expect((await request({ origin: null })).status).toBe(403); noMint(); expect(mocks.getActor).not.toHaveBeenCalled(); });
  it("rejects browser-supplied bodies and malformed session IDs", async () => { expect((await request({ body: '{"actor":"forged"}' })).status).toBe(400); expect((await request({ sid: "../start" })).status).toBe(400); noMint(); expect(mocks.runnerPost).not.toHaveBeenCalled(); });
  it("rejects guests", async () => { mocks.getActor.mockResolvedValue({ userId: null, guestId: "guest" }); expect((await request()).status).toBe(401); noMint(); expect(mocks.runnerPost).not.toHaveBeenCalled(); });
  it("rejects mismatched or malformed authenticated actor keys", async () => { mocks.requireRunnerActorKey.mockResolvedValue(`u:${"b".repeat(64)}`); expect((await request()).status).toBe(403); mocks.requireRunnerActorKey.mockResolvedValue("guest"); expect((await request()).status).toBe(403); noMint(); });
  it("requires current global-lab authorization", async () => { mocks.authorizeStudentAdminLab.mockResolvedValue(false); expect((await request()).status).toBe(403); expect(mocks.runnerPost).not.toHaveBeenCalled(); noMint(); });
  it("calls only the exact existing-session authorization endpoint before minting", async () => {
    const result = await request(); expect(result.status).toBe(200);
    expect(mocks.parseStudentAdminLabTarget).toHaveBeenCalledWith(target);
    expect(mocks.authorizeStudentAdminLab).toHaveBeenCalledWith(expect.objectContaining({ target }));
    expect(mocks.runnerPost).toHaveBeenCalledExactlyOnceWith(`/sessions/${sid}/admin/reattach`, actor, {});
    expect(mocks.createAttachToken).toHaveBeenCalledExactlyOnceWith({ sessionId: sid, actorKey: actor });
    expect(mocks.runnerPost.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAttachToken.mock.invocationCallOrder[0]);
    expect(result.body).toEqual({ ok: true, sessionId: sid, state: "waiting_for_input", attachToken: "TEST_TOKEN", wsUrl: `ws://localhost:4001/sessions/${sid}/ws?token=TEST_TOKEN` });
  });
  it("requests a fresh token on each authorized retry", async () => { mocks.createAttachToken.mockReturnValueOnce("first").mockReturnValueOnce("second"); expect((await request()).body.attachToken).toBe("first"); expect((await request()).body.attachToken).toBe("second"); expect(mocks.runnerPost).toHaveBeenCalledTimes(2); });
  it("rejects malformed or mismatched Runner acknowledgements", async () => { for (const reply of [null, { ok: false }, { ok: true, sessionId: "other", state: "running" }, { ok: true, sessionId: sid, state: "completed" }]) { mocks.runnerPost.mockResolvedValue(reply); expect((await request()).status).toBe(503); } noMint(); });
  it("rejects revoked or foreign sessions without leaking Runner details", async () => { mocks.runnerPost.mockRejectedValue(new mocks.RunnerHttpError(403)); const r = await request(); expect(r.status).toBe(403); expect(JSON.stringify(r.body)).not.toContain("PRIVATE_RUNNER_ERROR"); noMint(); });
  it("fails closed on Runner outage", async () => { mocks.runnerPost.mockRejectedValue(new Error("SECRET")); const r = await request(); expect(r.status).toBe(503); expect(JSON.stringify(r.body)).not.toContain("SECRET"); noMint(); });
  it("rejects a non-WebSocket or credential-bearing destination before minting", async () => { for (const base of ["https://example.test", "wss://user:pass@example.test"]) { mocks.getRunnerWsBase.mockReturnValue(base); expect((await request()).status).toBe(503); } noMint(); });
  it("uses WSS in production configuration", async () => { mocks.getRunnerWsBase.mockReturnValue("wss://runner.example.test"); expect((await request()).body.wsUrl).toBe(`wss://runner.example.test/sessions/${sid}/ws?token=TEST_TOKEN`); });
});
