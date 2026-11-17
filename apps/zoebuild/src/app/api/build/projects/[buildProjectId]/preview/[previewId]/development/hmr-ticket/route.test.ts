import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { issueOwnedDevelopmentPreviewHmrTicket } from "@/lib/build/reactPreviewDevelopmentHmrTicket";
import { POST } from "./route";

vi.mock("@zoeskoul/platform-server/http", () => ({ enforceSameOriginPost: vi.fn() }));
vi.mock("@/lib/build/currentBuildAccess", () => ({ loadCurrentBuildAccessSnapshot: vi.fn() }));
vi.mock("@/lib/build/reactPreviewDevelopmentHmrTicket", () => ({ issueOwnedDevelopmentPreviewHmrTicket: vi.fn() }));
vi.mock("@zoeskoul/platform-server/server/runnerClient", () => ({ RunnerHttpError: class RunnerHttpError extends Error { status = 503; } }));
vi.mock("@/lib/build/reactPreviewServer", () => ({
  ReactPreviewRequestError: class ReactPreviewRequestError extends Error {
    constructor(public code: string, message: string, public status: number) { super(message); }
  },
  parseReactPreviewId: vi.fn((value: string) => value),
}));

const previewId = "preview_123e4567-e89b-42d3-a456-426614174000";
const context = { params: Promise.resolve({ buildProjectId: "project_1", previewId }) };
const access = { userId: "owner_1", entitlements: [] };
function req(body: unknown = { sourceVersion: 7 }, origin = "https://zoebuild.example") {
  return new Request("https://zoebuild.example/api/build/projects/project_1/preview/" + previewId + "/development/hmr-ticket", {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED", "true");
  vi.mocked(enforceSameOriginPost).mockReturnValue(true);
  vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValue(access as never);
  vi.mocked(issueOwnedDevelopmentPreviewHmrTicket).mockResolvedValue({
    ticket: "a".repeat(43), expiresInMs: 20_000,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Phase 4E3C3B editor-only HMR ticket route", () => {
  it("returns 404 before session lookup when disabled", async () => {
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED", "false");
    expect((await POST(req(), context)).status).toBe(404);
    expect(loadCurrentBuildAccessSnapshot).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and unauthenticated callers before ticket minting", async () => {
    vi.mocked(enforceSameOriginPost).mockReturnValueOnce(false);
    expect((await POST(req(), context)).status).toBe(403);
    vi.mocked(loadCurrentBuildAccessSnapshot).mockResolvedValueOnce({ userId: null } as never);
    expect((await POST(req(), context)).status).toBe(401);
    expect(issueOwnedDevelopmentPreviewHmrTicket).not.toHaveBeenCalled();
  });
  it("accepts only a bounded saved revision, without browser-supplied actor or source", async () => {
    for (const body of [{ sourceVersion: 7, actorKey: "attacker" },
      { sourceVersion: 7, files: [] }, { sourceVersion: 7.2 }, { sourceVersion: "7" }]) {
      expect((await POST(req(body), context)).status).toBe(400);
    }
    expect(issueOwnedDevelopmentPreviewHmrTicket).not.toHaveBeenCalled();
  });
  it("authenticates authoritatively and never exposes Runner endpoint or capability", async () => {
    const result = await POST(req(), context);
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({ ok: true, ticket: "a".repeat(43), expiresInMs: 20_000 });
    expect(JSON.stringify(body)).not.toMatch(/docker|basePath|wsPath|runnerSecret/);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(loadCurrentBuildAccessSnapshot).toHaveBeenCalledWith(expect.any(Request), { requireAuthority: true });
    expect(issueOwnedDevelopmentPreviewHmrTicket).toHaveBeenCalledWith({
      access, buildProjectId: "project_1", previewId, sourceVersion: 7,
      requestOrigin: "https://zoebuild.example",
    });
  });
});
