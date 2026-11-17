import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireOwnedReactPreviewProject } from "@/lib/build/reactPreviewServer";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { issueTrustedReactDevelopmentHmrTicketAtRunner } from "@/lib/build/reactPreviewRunnerClient";
import { issueOwnedDevelopmentPreviewHmrTicket, requireConfiguredDevelopmentHmrOrigin } from "./reactPreviewDevelopmentHmrTicket";

vi.mock("@/lib/build/reactPreviewServer", () => ({
  ReactPreviewRequestError: class ReactPreviewRequestError extends Error {
    constructor(public code: string, message: string, public status: number) { super(message); }
  },
  parseReactPreviewId: vi.fn((id: string) => id),
  requireOwnedReactPreviewProject: vi.fn(),
}));
vi.mock("@/lib/server/runnerActorKey", () => ({ requireRunnerActorKey: vi.fn() }));
vi.mock("@/lib/build/reactPreviewRunnerClient", () => ({ issueTrustedReactDevelopmentHmrTicketAtRunner: vi.fn() }));

const id = "preview_123e4567-e89b-42d3-a456-426614174000";
const origin = "https://zoebuild.example";
const ticket = "a".repeat(43);
const access = { userId: "owner_1", entitlements: [] };
const input = { access, buildProjectId: "project_1", previewId: id, sourceVersion: 7, requestOrigin: origin };
const runnerData = { ok: true as const, ticket, expiresInMs: 20_000,
  wsPath: `/build/previews/${id}/development-hmr/ws` };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED", "true");
  vi.stubEnv("ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN", origin);
  vi.mocked(requireOwnedReactPreviewProject).mockResolvedValue({ sourceVersion: 7 } as never);
  vi.mocked(requireRunnerActorKey).mockResolvedValue(`u:${"a".repeat(64)}`);
  vi.mocked(issueTrustedReactDevelopmentHmrTicketAtRunner).mockResolvedValue(runnerData);
});
afterEach(() => vi.unstubAllEnvs());

describe("Phase 4E3C3B authenticated HMR ticket bridge", () => {
  it("fails before DB or Runner calls when disabled or anonymous", async () => {
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED", "false");
    await expect(issueOwnedDevelopmentPreviewHmrTicket(input)).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED", "true");
    await expect(issueOwnedDevelopmentPreviewHmrTicket({ ...input, access: { ...access, userId: "" } }))
      .rejects.toMatchObject({ status: 401 });
    expect(requireOwnedReactPreviewProject).not.toHaveBeenCalled();
    expect(issueTrustedReactDevelopmentHmrTicketAtRunner).not.toHaveBeenCalled();
  });
  it("requires the exact configured trusted nonopaque browser origin", async () => {
    for (const bad of [null, "null", "https://evil.example", "https://zoebuild.example.evil", "https://zoebuild.example/"]) {
      await expect(issueOwnedDevelopmentPreviewHmrTicket({ ...input, requestOrigin: bad }))
        .rejects.toMatchObject({ status: 503 });
    }
    for (const bad of ["http://evil.example", "https://user@zoebuild.example", "https://zoebuild.example/a"])
      { vi.stubEnv("ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN", bad);
        expect(() => requireConfiguredDevelopmentHmrOrigin(bad)).toThrow(); }
    expect(requireOwnedReactPreviewProject).not.toHaveBeenCalled();
  });
  it("rechecks DB ownership/revision and issues only a bounded ticket", async () => {
    expect(await issueOwnedDevelopmentPreviewHmrTicket(input)).toEqual({ ticket, expiresInMs: 20_000 });
    expect(requireOwnedReactPreviewProject).toHaveBeenCalledWith({ access, buildProjectId: "project_1" });
    expect(requireRunnerActorKey).toHaveBeenCalledWith("owner_1");
    expect(issueTrustedReactDevelopmentHmrTicketAtRunner).toHaveBeenCalledWith({
      actorKey: `u:${"a".repeat(64)}`, previewId: id,
      buildProjectId: "project_1", sourceVersion: 7, origin,
    });
  });
  it("refuses stale revision, denied project, invalid IDs without Runner issuance", async () => {
    vi.mocked(requireOwnedReactPreviewProject).mockResolvedValueOnce({ sourceVersion: 8 } as never);
    await expect(issueOwnedDevelopmentPreviewHmrTicket(input)).rejects.toMatchObject({ status: 409 });
    vi.mocked(requireOwnedReactPreviewProject).mockRejectedValueOnce(Error("denied"));
    await expect(issueOwnedDevelopmentPreviewHmrTicket(input)).rejects.toThrow("denied");
    await expect(issueOwnedDevelopmentPreviewHmrTicket({ ...input, previewId: "bad" }))
      .rejects.toMatchObject({ status: 400 });
    await expect(issueOwnedDevelopmentPreviewHmrTicket({ ...input, sourceVersion: 7.4 }))
      .rejects.toMatchObject({ status: 400 });
    expect(issueTrustedReactDevelopmentHmrTicketAtRunner).not.toHaveBeenCalled();
  });
  it("fails closed on malformed or extra Runner data", async () => {
    for (const invalid of [
      { ...runnerData, ticket: "short" },
      { ...runnerData, expiresInMs: 99_999 },
      { ...runnerData, wsPath: "/docker/secret" },
      { ...runnerData, basePath: "/secret" },
      { ...runnerData, ok: false }, null,
    ]) {
      vi.mocked(issueTrustedReactDevelopmentHmrTicketAtRunner).mockResolvedValueOnce(invalid as never);
      await expect(issueOwnedDevelopmentPreviewHmrTicket(input)).rejects.toMatchObject({ status: 503 });
    }
  });
});
