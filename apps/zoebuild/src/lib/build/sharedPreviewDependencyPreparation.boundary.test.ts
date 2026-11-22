import { describe, expect, it, vi } from "vitest";
import {
  needsSharedPreviewDependencyPreparation,
  requestSavedPreviewDependencyPreparation,
  prepareSharedPreviewDependencies,
} from "./sharedPreviewDependencyPreparation";

const selection = {
  buildProjectId: "project /1",
  sourceVersion: 42,
  restoredDependencyPinned: true,
} as const;

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("shared preview dependency preparation boundary", () => {
  it("checks for both trusted root files without treating the browser check as approval", () => {
    const nodes = [
      { kind: "file", parentId: null, name: "pnpm-lock.yaml" },
      { kind: "file", parentId: null, name: "zoebuild-dependency-approval.json" },
    ];
    expect(needsSharedPreviewDependencyPreparation(nodes)).toBe(false);
    expect(needsSharedPreviewDependencyPreparation(nodes.slice(0, 1))).toBe(true);
    expect(needsSharedPreviewDependencyPreparation([])).toBe(true);
  });

  it("sends exact saved-source CAS, exclusive restore/project modes and same-origin credentials", async () => {
    const fetchClient = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(200, { ok: true }));
    await requestSavedPreviewDependencyPreparation(selection, fetchClient as unknown as typeof fetch);
    expect(fetchClient).toHaveBeenCalledTimes(1);
    const [url, init] = fetchClient.mock.calls[0]!;
    expect(url).toBe("/api/build/projects/project%20%2F1/dependency-lock/bootstrap");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(init?.body as string)).toEqual({
      reconcileExisting: true, baseVersion: 42,
      autoRestoreDependencies: true, autoPrepareProjectDependencies: false,
    });
    const own = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(200, { ok: true }));
    await requestSavedPreviewDependencyPreparation({ ...selection, restoredDependencyPinned: false }, own as unknown as typeof fetch);
    const [, nextInit] = own.mock.calls[0]!;
    expect(JSON.parse(nextInit?.body as string)).toEqual({
      reconcileExisting: true, baseVersion: 42,
      autoRestoreDependencies: false, autoPrepareProjectDependencies: true,
    });
  });

  it("never sends an obsolete selection to the server", async () => {
    const fetchClient = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(200, { ok: true }));
    const result = await prepareSharedPreviewDependencies({ ...selection,
      isCurrent: () => false,
      reconcileConflict: async () => false,
      reconcilePrepared: async () => false,
      fetchClient: fetchClient as unknown as typeof fetch,
    });
    expect(result.kind).toBe("superseded");
    expect(fetchClient).not.toHaveBeenCalled();
  });

  it("reconciles a trusted newer source and never marks a bad response prepared", async () => {
    const fetchClient = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(200, {
      ok: true, bootstrap: { source: { sourceVersion: 43 } },
    }));
    const reconcileConflict = vi.fn(async () => true);
    const reconcilePrepared = vi.fn(async () => false);
    const success = await prepareSharedPreviewDependencies({ ...selection,
      isCurrent: () => true, reconcileConflict, reconcilePrepared,
      fetchClient: fetchClient as unknown as typeof fetch,
    });
    expect(success.kind).toBe("prepared");
    expect(reconcileConflict).toHaveBeenCalledWith(42);
    expect(reconcilePrepared).not.toHaveBeenCalled();

    const invalid = await prepareSharedPreviewDependencies({ ...selection,
      isCurrent: () => true,
      reconcileConflict: async () => true,
      reconcilePrepared: async () => true,
      fetchClient: (async () => response(403, { ok: false, code: "BUILD_FORBIDDEN" })) as typeof fetch,
    });
    expect(invalid.kind).toBe("error");
  });
});
