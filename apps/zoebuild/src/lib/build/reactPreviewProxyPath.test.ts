import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeReactPreviewProxyPath } from "./reactPreviewProxyPath";

const basePath =
  "/api/build/projects/project_1/preview/" +
  "preview_11111111-1111-1111-1111-111111111111/" +
  "content/abcdefghijklmnopqrstuvwxyzABCDEF/";

describe("React preview browser capability path", () => {
  it("normalizes only the exact capability root without a trailing slash", () => {
    expect(
      normalizeReactPreviewProxyPath({
        pathname: basePath.slice(0, -1),
        basePath,
      }),
    ).toBe(basePath);

    expect(
      normalizeReactPreviewProxyPath({
        pathname: basePath,
        basePath,
      }),
    ).toBe(basePath);
  });

  it("preserves nested Vite asset paths under the same capability", () => {
    expect(
      normalizeReactPreviewProxyPath({
        pathname: `${basePath}src/main.tsx`,
        basePath,
      }),
    ).toBe(`${basePath}src/main.tsx`);

    expect(
      normalizeReactPreviewProxyPath({
        pathname: `${basePath}@vite/client`,
        basePath,
      }),
    ).toBe(`${basePath}@vite/client`);
  });

  it("rejects siblings, different capabilities, and malformed base paths", () => {
    expect(
      normalizeReactPreviewProxyPath({
        pathname: `${basePath.slice(0, -1)}-attacker`,
        basePath,
      }),
    ).toBeNull();

    expect(
      normalizeReactPreviewProxyPath({
        pathname:
          "/api/build/projects/project_1/preview/" +
          "preview_11111111-1111-1111-1111-111111111111/" +
          "content/DIFFERENTCAPABILITY123456789012/",
        basePath,
      }),
    ).toBeNull();

    expect(
      normalizeReactPreviewProxyPath({
        pathname: basePath,
        basePath: basePath.slice(0, -1),
      }),
    ).toBeNull();
  });

  it("wires the normalized pathname into the capability proxy route", () => {
    const routeSource = readFileSync(
      resolve(
        __dirname, "../../..",
        "src/app/api/build/projects/[buildProjectId]/preview/" +
          "[previewId]/content/[capability]/[[...path]]/route.ts",
      ),
      "utf8",
    );

    expect(routeSource).toContain(
      "normalizeReactPreviewProxyPath({",
    );
    // The validated Vite HTML root is used only for the canonical document
    // gateway. JS, CSS and other assets retain their normalized, scoped path.
    expect(routeSource).toContain(
      'const documentGateway = documentTarget.isDocumentGateway;',
    );
    expect(routeSource).toContain("previewDocumentProxyTarget(url.pathname, basePath)");
    expect(routeSource).toContain("resolvePreviewDocumentProxyPath({");
    expect(routeSource).toContain("normalize: normalizeReactPreviewProxyPath");
    expect(routeSource).toContain(
      'if (documentGateway && method !== "GET") return errorResponse("Method not allowed.", 405);',
    );
    expect(routeSource).toContain(
      'if (documentGateway && parseReactPreviewDocumentRequest(url) === null)',
    );
    expect(routeSource).toContain(
      'path: documentGateway ? basePath : `${normalizedPathname}${url.search}`',
    );
    expect(routeSource).not.toContain(
      'path: `${url.pathname}${url.search}`',
    );
  });
});
