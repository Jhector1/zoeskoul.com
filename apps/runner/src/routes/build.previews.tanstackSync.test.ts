import { afterEach, describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { TANSTACK_PREVIEW_RESTART_REQUIRED } from "@zoeskoul/build-executor-contracts";
import { syncBuildPreviewRoute } from "./build.previews.sync.js";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";

const previewId = "preview_p3b7d7";
const projectId = "project_p3b7d7";
const ownerKey = "actor-p3b7d7";
const baseRequest = {
  operation: "production-build" as const,
  protocolVersion: 1 as const,
  buildProjectId: projectId,
  sourceVersion: 9,
  stackId: "tanstack-start-v1",
  templateId: "tanstack-start-v1",
  files: [
    { path: "package.json", content: '{"private":true}' },
    { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'\n" },
  ],
};
let cleanupCalls = 0;
function registerLease() {
  const now = Date.now();
  sharedFullStackPreviews.register({
    id: previewId,
    ownerKey,
    buildProjectId: projectId,
    sourceVersion: 8,
    containerId: "sandbox_p3b7d7",
    basePath: `/api/build/projects/${projectId}/preview/${previewId}/content/cap/`,
    createdAt: now,
    lastActivityAt: now,
    close: async () => { cleanupCalls++; },
  });
}

async function invoke(input: Readonly<{
  actor?: string;
  preview?: string;
  body?: unknown;
}> = {}) {
  let statusCode = 200;
  let body: unknown = null;
  const req = {
    params: { previewId: input.preview ?? previewId },
    body: input.body ?? baseRequest,
    header: (name: string) => name === "x-actor-key" ? (input.actor ?? ownerKey) : undefined,
  } as unknown as Request;
  const res = {
    status: (nextStatus: number) => { statusCode = nextStatus; return res; },
    json: (nextBody: unknown) => { body = nextBody; return res; },
  } as unknown as Response & {
    status: (code: number) => Response;
    json: (content: unknown) => Response;
  };
  await syncBuildPreviewRoute(req, res, (() => {}) as NextFunction);
  return { statusCode, body: body as { ok: boolean; error: string } | null };
}

afterEach(async () => {
  for (const lease of sharedFullStackPreviews.list()) await sharedFullStackPreviews.close(lease.id);
  sharedFullStackPreviews.resetForTests();
  cleanupCalls = 0;
});

describe("P3B7D7 TanStack-only preview sync endpoint", () => {
  it("signals restart and leaves the existing lease untouched", async () => {
    registerLease();
    const result = await invoke();
    expect(result.statusCode).toBe(409);
    expect(result.body).toEqual({ ok: false, error: TANSTACK_PREVIEW_RESTART_REQUIRED });
    expect(sharedFullStackPreviews.get(previewId)?.sourceVersion).toBe(8);
    expect(cleanupCalls).toBe(0);
  });

  it("rejects a different actor without leaking a restart signal", async () => {
    registerLease();
    expect(await invoke({ actor: "other-actor" })).toMatchObject({
      statusCode: 403, body: { ok: false, error: "Forbidden." },
    });
    expect(cleanupCalls).toBe(0);
  });

  it("rejects a mismatched project or older source version", async () => {
    registerLease();
    for (const change of [{ buildProjectId: "other-project" }, { sourceVersion: 7 }]) {
      const result = await invoke({ body: { ...baseRequest, ...change } });
      expect(result.statusCode).toBe(409);
      expect(result.body?.error).toBe("Preview source is stale.");
    }
    expect(sharedFullStackPreviews.count()).toBe(1);
  });

  it("rejects legacy stack and template identities without mutation", async () => {
    registerLease();
    for (const change of [{ stackId: "react-vite-v1" }, { templateId: "react-vite-v1" }]) {
      const result = await invoke({ body: { ...baseRequest, ...change } });
      expect(result.statusCode).toBe(400);
      expect(result.body?.error).toBe("Invalid TanStack preview identity.");
    }
    expect(cleanupCalls).toBe(0);
  });

  it("never starts or syncs a missing preview", async () => {
    expect(await invoke({ preview: "preview_does_not_exist" })).toMatchObject({
      statusCode: 404, body: { ok: false, error: "Preview not found." },
    });
    expect(sharedFullStackPreviews.count()).toBe(0);
  });

  it("rejects dependency bootstrap and malformed source operations", async () => {
    registerLease();
    const bootstrap = {
      ...baseRequest,
      operation: "dependency-lock-bootstrap",
      files: [{ path: "package.json", content: "{}" }],
    };
    expect((await invoke({ body: bootstrap })).statusCode).toBe(400);
    expect((await invoke({ body: { ...baseRequest, files: [] } })).statusCode).toBe(400);
    expect(cleanupCalls).toBe(0);
  });

  it("rejects missing service actor credentials", async () => {
    registerLease();
    // Override only the actor-key method on this request to model missing
    // credentials, not a recognized but unauthorized actor identity.
    const result = await (async () => {
      const req = {
        params: { previewId }, body: baseRequest, header: () => undefined,
      } as unknown as Request;
      let statusCode = 200;
      let error = "";
      const res = {
        status: (next: number) => { statusCode = next; return res; },
        json: (data: { error: string }) => { error = data.error; return res; },
      } as unknown as Response;
      await syncBuildPreviewRoute(req, res, (() => {}) as NextFunction);
      return { statusCode, error };
    })();
    expect(result).toEqual({ statusCode: 403, error: "Forbidden." });
    expect(cleanupCalls).toBe(0);
  });
});
