import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  actorKeyOf: vi.fn(),
  requireRunnerActorKey: vi.fn(),
  runnerPost: vi.fn(),
  createAttachToken: vi.fn(),
  getRunnerWsBase: vi.fn(),
  authorizeStudentAdminLab: vi.fn(),
  mintStudentAdminLabGrant: vi.fn(),
  RunnerHttpError: class RunnerHttpError extends Error {
    constructor(public readonly status: number) {
      super("private runner response");
    }
  },
}));

// The route is tested at the HTTP boundary, while external auth/DB/Runner
// dependencies are replaced by deterministic stubs. These tests make no
// live Runner requests and cannot mint a real administrator grant.
vi.mock("next/server", () => ({
  NextResponse: {
    json(payload: unknown, init?: { status?: number }) {
      return new Response(JSON.stringify(payload), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  },
}));
vi.mock("@/lib/practice/actor", () => ({
  getActor: mocks.getActor,
  actorKeyOf: mocks.actorKeyOf,
}));
vi.mock("@/lib/server/runnerActorKey", () => ({ requireRunnerActorKey: mocks.requireRunnerActorKey }));
vi.mock("@/lib/server/runnerClient", () => ({
  runnerPost: mocks.runnerPost,
  RunnerHttpError: mocks.RunnerHttpError,
}));
vi.mock("@/lib/server/ptyAttachToken", () => ({ createAttachToken: mocks.createAttachToken }));
vi.mock("@/lib/server/runnerWsBase", () => ({ getRunnerWsBase: mocks.getRunnerWsBase }));
vi.mock("@/lib/learning/server/authorizeStudentAdminLab", () => ({
  authorizeStudentAdminLab: mocks.authorizeStudentAdminLab,
}));
vi.mock("@/lib/server/mintStudentAdminLabGrant", () => ({
  mintStudentAdminLabGrant: mocks.mintStudentAdminLabGrant,
}));

import { POST } from "./route";

const WEB_ORIGIN = "https://learn.example.test";
const ACTOR_KEY = `u:${"a".repeat(64)}`;
const VALID_TARGET = Object.freeze({
  moduleSlug: "linux-module-3-users-groups-troubleshooting",
  topicSlug: "sudo-root-concepts",
});

function makeRequest(args: {
  body?: string;
  origin?: string | null;
  contentType?: string | null;
} = {}) {
  const headers: Record<string, string> = {};
  if (args.origin !== null) headers.origin = args.origin ?? WEB_ORIGIN;
  if (args.contentType !== null) headers["content-type"] = args.contentType ?? "application/json";
  return new Request(`${WEB_ORIGIN}/api/run/pty/sessions/admin/start`, {
    method: "POST",
    headers,
    body: args.body ?? JSON.stringify(VALID_TARGET),
  });
}

async function send(args: Parameters<typeof makeRequest>[0] = {}) {
  const response = await POST(makeRequest(args) as Parameters<typeof POST>[0]);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function assertNoExternalWork() {
  expect(mocks.getActor).not.toHaveBeenCalled();
  expect(mocks.requireRunnerActorKey).not.toHaveBeenCalled();
  expect(mocks.authorizeStudentAdminLab).not.toHaveBeenCalled();
  expect(mocks.mintStudentAdminLabGrant).not.toHaveBeenCalled();
  expect(mocks.runnerPost).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED", "true");
  vi.stubEnv("ZOESKOUL_LEARNING_WEB_ORIGIN", WEB_ORIGIN);
  mocks.getActor.mockResolvedValue({ userId: "student-1", guestId: null });
  mocks.actorKeyOf.mockReturnValue(ACTOR_KEY);
  mocks.requireRunnerActorKey.mockResolvedValue(ACTOR_KEY);
  mocks.authorizeStudentAdminLab.mockResolvedValue(true);
  mocks.mintStudentAdminLabGrant.mockReturnValue("PRIVATE_SIGNED_GRANT");
  mocks.runnerPost.mockResolvedValue({ ok: true, sessionId: "session-1", state: "waiting_for_input" });
  mocks.createAttachToken.mockReturnValue("PRIVATE_ATTACH_TOKEN");
  mocks.getRunnerWsBase.mockReturnValue("wss://runner.example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("student administrator lab HTTP start route", () => {
  it("fails closed when the student feature flag is disabled", async () => {
    vi.stubEnv("ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED", "false");
    expect((await send()).status).toBe(403);
    assertNoExternalWork();
  });

  it("rejects a cross-site origin before authentication or grant minting", async () => {
    expect((await send({ origin: "https://untrusted.example.test" })).status).toBe(403);
    assertNoExternalWork();
  });

  it("rejects an absent origin before authentication", async () => {
    expect((await send({ origin: null })).status).toBe(403);
    assertNoExternalWork();
  });

  it("rejects content that is not JSON", async () => {
    expect((await send({ contentType: "text/plain" })).status).toBe(415);
    assertNoExternalWork();
  });

  it("rejects a JSON body larger than 1024 bytes before authentication", async () => {
    expect((await send({ body: JSON.stringify({ padding: "x".repeat(1100) }) })).status).toBe(413);
    assertNoExternalWork();
  });

  it("rejects malformed JSON without grant minting", async () => {
    expect((await send({ body: '{"topicSlug":' })).status).toBe(400);
    assertNoExternalWork();
  });

  it("rejects unrecognized request keys", async () => {
    const body = JSON.stringify({ ...VALID_TARGET, grant: "browser-supplied" });
    expect((await send({ body })).status).toBe(400);
    assertNoExternalWork();
  });

  it("rejects topic-to-module mismatches", async () => {
    const body = JSON.stringify({ ...VALID_TARGET, moduleSlug: "linux-module-4-secure-project-capstone" });
    expect((await send({ body })).status).toBe(400);
    assertNoExternalWork();
  });

  it("rejects unknown administrator topics", async () => {
    const body = JSON.stringify({ ...VALID_TARGET, topicSlug: "arbitrary-root-task" });
    expect((await send({ body })).status).toBe(400);
    assertNoExternalWork();
  });

  it("rejects unauthenticated users without asking for a Runner actor key", async () => {
    mocks.getActor.mockResolvedValue({ userId: null, guestId: "guest" });
    expect((await send()).status).toBe(401);
    expect(mocks.requireRunnerActorKey).not.toHaveBeenCalled();
    expect(mocks.mintStudentAdminLabGrant).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects an invalid Runner actor key", async () => {
    mocks.requireRunnerActorKey.mockResolvedValue("e2e:untrusted");
    expect((await send()).status).toBe(403);
    expect(mocks.authorizeStudentAdminLab).not.toHaveBeenCalled();
    expect(mocks.mintStudentAdminLabGrant).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects a validly formatted Runner key for a different learning actor", async () => {
    mocks.actorKeyOf.mockReturnValue(`u:${"b".repeat(64)}`);
    const result = await send();
    expect(result.status).toBe(403);
    expect(result.body.ok).toBe(false);
    expect(mocks.actorKeyOf).toHaveBeenCalledWith({ userId: "student-1", guestId: null });
    expect(mocks.authorizeStudentAdminLab).not.toHaveBeenCalled();
    expect(mocks.mintStudentAdminLabGrant).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("does not mint an admin grant when resolving the actor identity fails", async () => {
    mocks.actorKeyOf.mockImplementation(() => { throw new Error("PRIVATE_IDENTITY_FAILURE"); });
    const result = await send();
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("PRIVATE_IDENTITY_FAILURE");
    expect(mocks.authorizeStudentAdminLab).not.toHaveBeenCalled();
    expect(mocks.mintStudentAdminLabGrant).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects denied published-course or enrollment access before grant minting", async () => {
    mocks.authorizeStudentAdminLab.mockResolvedValue(false);
    expect((await send()).status).toBe(403);
    expect(mocks.mintStudentAdminLabGrant).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("forwards only a web-minted grant for an authorized exact topic", async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(mocks.actorKeyOf).toHaveBeenCalledWith({ userId: "student-1", guestId: null });
    expect(mocks.authorizeStudentAdminLab).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ userId: "student-1" }),
      target: VALID_TARGET,
    }));
    expect(mocks.mintStudentAdminLabGrant).toHaveBeenCalledWith({
      actorKey: ACTOR_KEY,
      target: VALID_TARGET,
    });
    expect(mocks.runnerPost).toHaveBeenCalledTimes(1);
    expect(mocks.runnerPost).toHaveBeenCalledWith(
      "/sessions/admin/start",
      ACTOR_KEY,
      { grant: "PRIVATE_SIGNED_GRANT" },
    );
    expect(mocks.createAttachToken).toHaveBeenCalledWith({
      sessionId: "session-1",
      actorKey: ACTOR_KEY,
    });
    expect(response.body).toEqual({
      ok: true,
      sessionId: "session-1",
      state: "waiting_for_input",
      attachToken: "PRIVATE_ATTACH_TOKEN",
      wsUrl: "wss://runner.example.test/sessions/session-1/ws?token=PRIVATE_ATTACH_TOKEN",
    });
    expect(JSON.stringify(response.body)).not.toContain("PRIVATE_SIGNED_GRANT");
  });

  it("does not return success if the Runner fails to create a session", async () => {
    mocks.runnerPost.mockResolvedValue({ ok: false });
    const result = await send();
    expect(result.status).toBe(503);
    expect(result.body.ok).toBe(false);
    expect(mocks.createAttachToken).not.toHaveBeenCalled();
  });

  it("maps Runner permission errors to a generic 403", async () => {
    mocks.runnerPost.mockRejectedValue(new mocks.RunnerHttpError(403));
    const result = await send();
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).not.toContain("private runner response");
  });

  it("maps other Runner errors to a generic 503", async () => {
    mocks.runnerPost.mockRejectedValue(new mocks.RunnerHttpError(502));
    const result = await send();
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("private runner response");
  });

  it("does not disclose grant contents or internal errors on unexpected failure", async () => {
    mocks.runnerPost.mockRejectedValue(new Error("SECRET_INTERNAL_EXCEPTION"));
    const result = await send();
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("SECRET_INTERNAL_EXCEPTION");
    expect(JSON.stringify(result.body)).not.toContain("PRIVATE_SIGNED_GRANT");
  });
});
