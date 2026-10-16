import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { proxyFetchTrustedReactPreviewAtRunner } from "@/lib/build/reactPreviewRunnerClient";
import { parseReactPreviewId, ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { normalizeReactPreviewProxyPath } from "@/lib/build/reactPreviewProxyPath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function validCapability(value: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(value);
}

async function proxy(
  req: Request,
  ctx: {
    params: Promise<{
      buildProjectId: string;
      previewId: string;
      capability: string;
      path?: string[];
    }>;
  },
  method: "GET" | "HEAD",
) {
  const { buildProjectId, previewId: rawPreviewId, capability } = await ctx.params;

  try {
    const previewId = parseReactPreviewId(rawPreviewId);
    if (!validCapability(capability)) {
      return errorResponse("Invalid preview capability.", 404);
    }

    const url = new URL(req.url);
    const basePath =
      `/api/build/projects/${encodeURIComponent(buildProjectId)}` +
      `/preview/${encodeURIComponent(previewId)}` +
      `/content/${encodeURIComponent(capability)}/`;

    const normalizedPathname = normalizeReactPreviewProxyPath({
      pathname: url.pathname,
      basePath,
    });

    if (!normalizedPathname) {
      return errorResponse("Invalid preview path.", 404);
    }

    const result = await proxyFetchTrustedReactPreviewAtRunner({
      previewId,
      path: `${normalizedPathname}${url.search}`,
      method,
    });

    const headers = new Headers();
    const contentType = result.headers["content-type"];
    if (contentType) headers.set("Content-Type", contentType);
    const etag = result.headers.etag;
    if (etag) headers.set("ETag", etag);
    const location = result.headers.location;
    if (location && location.startsWith(basePath)) headers.set("Location", location);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");

    const body =
      method === "HEAD"
        ? null
        : new Uint8Array(Buffer.from(result.bodyBase64, "base64"));

    return new Response(body, { status: result.status, headers });
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) {
      return errorResponse(error.message, error.status);
    }
    if (error instanceof RunnerHttpError) {
      return errorResponse(
        error.status === 404 ? "Preview expired." : "Preview service unavailable.",
        error.status === 404 ? 404 : 502,
      );
    }
    console.error("[ZoeBuild preview content proxy] failed", { buildProjectId, error });
    return errorResponse("Preview service unavailable.", 502);
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string; previewId: string; capability: string; path?: string[] }> },
) {
  return proxy(req, ctx, "GET");
}

export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string; previewId: string; capability: string; path?: string[] }> },
) {
  return proxy(req, ctx, "HEAD");
}
