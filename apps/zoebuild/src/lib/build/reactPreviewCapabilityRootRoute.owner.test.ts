import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { normalizeReactPreviewProxyPath } from "./reactPreviewProxyPath";

const runner = vi.hoisted(() => ({
  fetch: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/lib/build/reactPreviewRunnerClient", () => ({
  proxyFetchTrustedReactPreviewAtRunner: runner.fetch,
  resolveTrustedReactPreviewCapabilityAtRunner: runner.resolve,
}));
vi.mock("@zoeskoul/platform-server/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/commerce/commerceRuntime", () => ({
  beginCommerceCheckout: vi.fn(),
  executeCommerceCartCommand: vi.fn(),
  getCommerceProduct: vi.fn(),
  listCommerceProducts: vi.fn(),
}));

import {
  GET as getCapabilityRoot,
  HEAD as headCapabilityRoot,
} from "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/route";
import {
  GET as getCapabilityPath,
} from "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[...path]/route";
import {
  GET as getPreviewDocument,
  HEAD as headPreviewDocument,
} from "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/preview-document/route";

const apiRoot = resolve(
  __dirname,
  "../../..",
  "src/app/api/build/projects/[buildProjectId]/preview/" +
    "[previewId]/content/[capability]",
);

const basePath =
  "/api/build/projects/project_1/preview/" +
  "preview_11111111-1111-1111-1111-111111111111/" +
  "content/abcdefghijklmnopqrstuvwxyzABCDEF/";

const projectId = "project_1";
const previewId = "preview_11111111-1111-1111-1111-111111111111";
const capability = "abcdefghijklmnopqrstuvwxyzABCDEF";
const origin = "https://build.zoeskoul.test";
const html = "<!doctype html><html><head><title>Site</title></head><body><main>Home</main></body></html>";

function context(overrides: Partial<{
  buildProjectId: string;
  previewId: string;
  capability: string;
  path: string[];
}> = {}) {
  return {
    params: Promise.resolve({ buildProjectId: projectId, previewId, capability, ...overrides }),
  };
}

function upstream(status = 200, contentType = "text/html; charset=utf-8", body = html) {
  return {
    status,
    headers: { "content-type": contentType },
    bodyBase64: Buffer.from(body).toString("base64"),
    timing: {runnerProxyMs:7.2,dockerExecMs:6.1,viteUpstreamMs:4.3},
  };
}

beforeEach(() => {
  runner.fetch.mockReset();
  runner.resolve.mockReset();
  runner.fetch.mockResolvedValue(upstream());
  runner.resolve.mockResolvedValue({ previewId, buildProjectId: projectId, sourceVersion: 7 });
});

describe("TanStack preview capability root reachability", () => {
  it("registers a sibling route for the bare capability URL", () => {
    const source = readFileSync(resolve(apiRoot, "route.ts"), "utf8");
    expect(source).toContain('export { GET, HEAD } from "./[...path]/route";');
    expect(source).toContain('export const runtime = "nodejs"');
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).not.toMatch(/export\s+(?:async\s+)?(?:function|const)\s+POST\b/);
    const nested = readFileSync(resolve(apiRoot, "[...path]/route.ts"), "utf8");
    expect(nested).toContain('export async function GET(');
    expect(nested).toContain('export async function HEAD(');
    expect(nested).toContain("resolveTrustedReactPreviewCapabilityAtRunner");
  });

  it("normalizes the bare URL to the scoped Vite root without opening siblings", () => {
    expect(normalizeReactPreviewProxyPath({
      pathname: basePath.slice(0, -1), basePath,
    })).toBe(basePath);
    expect(normalizeReactPreviewProxyPath({
      pathname: basePath, basePath,
    })).toBe(basePath);
    expect(normalizeReactPreviewProxyPath({
      pathname: `${basePath.slice(0, -1)}-elsewhere`, basePath,
    })).toBeNull();
  });
});

describe("TanStack capability gateway HTTP behavior", () => {
  it("serves the capability root with and without a trailing slash for GET and HEAD", async () => {
    for (const pathname of [basePath.slice(0, -1), basePath]) {
      const response = await getCapabilityRoot(new Request(origin + pathname), context());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^text\/html/);
      expect(response.headers.get("server-timing")).toMatch(
        /gateway;dur=\d+\.\d, runner_roundtrip;dur=\d+\.\d, runner_proxy;dur=7\.2, docker_exec;dur=6\.1, vite_upstream;dur=4\.3/,
      );
      expect(response.headers.get("server-timing")).not.toContain(capability);
      expect(await response.text()).toContain("<main>Home</main>");
      expect(runner.fetch).toHaveBeenLastCalledWith({
        previewId,
        path: basePath,
        method: "GET",
        accept: "*/*",
      });
    }

    const response = await headCapabilityRoot(
      new Request(origin + basePath, { method: "HEAD" }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await response.text()).toBe("");
    expect(runner.fetch).toHaveBeenLastCalledWith({
      previewId,
      path: basePath,
      method: "HEAD",
      accept: "*/*",
    });
  });

  it("serves preview-document and nested application refreshes without replacing real 404s", async () => {
    const documentUrl = new URL(origin + basePath + "preview-document");
    documentUrl.searchParams.set("__zb_preview_route", "/about");
    documentUrl.searchParams.set("__zb_preview_revision", "7");
    const document = await getPreviewDocument(new Request(documentUrl), context());
    expect(document.status).toBe(200);
    expect(await document.text()).toContain("data-zoebuild-navigation-bridge");
    expect(runner.fetch).toHaveBeenLastCalledWith({
      previewId,
      path: basePath,
      method: "GET",
      accept: "*/*",
    });

    const head = await headPreviewDocument(
      new Request(documentUrl, { method: "HEAD" }),
      context(),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    for (let refresh = 0; refresh < 2; refresh += 1) {
      const about = await getCapabilityPath(
        new Request(origin + basePath + "about"),
        context({ path: ["about"] }),
      );
      expect(about.status).toBe(200);
      expect(about.headers.get("content-type")).toMatch(/^text\/html/);
      expect(runner.fetch).toHaveBeenLastCalledWith({
        previewId,
        path: basePath + "about",
        method: "GET",
        accept: "*/*",
      });
    }

    runner.fetch.mockResolvedValueOnce(upstream(404, "text/html; charset=utf-8", "real app 404"));
    const missing = await getCapabilityPath(
      new Request(origin + basePath + "missing"),
      context({ path: ["missing"] }),
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("real app 404");
    expect(missing.headers.get("x-zoebuild-preview-failure")).toBeNull();
  });

  it("preserves CSS and JavaScript MIME contracts without forwarding browser credentials", async () => {
    runner.fetch.mockResolvedValueOnce(upstream(200, "text/css; charset=utf-8", "body{color:red}"));
    const css = await getCapabilityPath(
      new Request(origin + basePath + "src/styles.css", {
        headers: {
          accept: "text/css,*/*;q=0.1",
          authorization: "Bearer browser-secret",
          cookie: "session=browser-secret",
        },
      }),
      context({ path: ["src", "styles.css"] }),
    );
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(runner.fetch).toHaveBeenLastCalledWith({
      previewId,
      path: basePath + "src/styles.css",
      method: "GET",
      accept: "text/css",
    });

    runner.fetch.mockResolvedValueOnce(upstream(
      200,
      "application/javascript; charset=utf-8",
      "export const ready=true;",
    ));
    const javascript = await getCapabilityPath(
      new Request(origin + basePath + "src/router.tsx", {
        headers: { accept: "application/javascript,*/*;q=0.8" },
      }),
      context({ path: ["src", "router.tsx"] }),
    );
    expect(javascript.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
    expect(await javascript.text()).toContain("export const ready=true");
    expect(runner.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ accept: "*/*" }));
  });

  it("rejects invalid, expired, and mismatched capabilities without leaking redirects or internals", async () => {
    const invalid = await getCapabilityRoot(
      new Request(origin + basePath.replace(capability, "short")),
      context({ capability: "short" }),
    );
    expect(invalid.status).toBe(404);
    expect(runner.fetch).not.toHaveBeenCalled();

    runner.fetch.mockRejectedValueOnce(new RunnerHttpError(404, "Preview not found."));
    const expired = await getCapabilityRoot(new Request(origin + basePath), context());
    expect(expired.status).toBe(404);
    expect(await expired.text()).toBe("Preview expired.");

    const foreignPath = basePath.replace(projectId, "project_2") + "__zoebuild/navigation.js";
    const foreign = await getCapabilityPath(
      new Request(origin + foreignPath),
      context({ buildProjectId: "project_2", path: ["__zoebuild", "navigation.js"] }),
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe("Preview capability does not match this project.");

    runner.fetch.mockResolvedValueOnce({
      ...upstream(),
      headers: {
        "content-type": "text/html; charset=utf-8",
        location: "http://127.0.0.1:5173/internal",
        "set-cookie": "preview-secret=bad",
      },
    });
    const protectedResponse = await getCapabilityRoot(new Request(origin + basePath), context());
    expect(protectedResponse.headers.get("location")).toBeNull();
    expect(protectedResponse.headers.get("set-cookie")).toBeNull();
  });
});
