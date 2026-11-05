import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { registeredTanstackPreviewRoutes } from "./tanstackPreviewPageCatalog";

const file = (path: string, content: string): WorkspaceSyncEntry => ({ kind: "file", path, content });
const page = (url: string) => `import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("${url}")({ component: Page });
function Page() { return null; }`;

describe("saved TanStack Start preview navigation", () => {
  it("discovers the canonical home and about routes, without relying on legacy React registries", () => {
    expect(registeredTanstackPreviewRoutes([
      file("src/routes/__root.tsx", "root"),
      file("src/routes/index.tsx", page("/")),
      file("src/routes/about.tsx", page("/about")),
      file("src/routes/api.health.ts", 'createFileRoute("/api/health")({server:{handlers:{GET(){}}}})'),
    ])).toEqual([{ path: "/", label: "Home" }, { path: "/about", label: "About" }]);
  });

  it("supports nested directory, index, and dot-file pages only when their route declarations match", () => {
    expect(registeredTanstackPreviewRoutes([
      file("src/routes/blog/index.tsx", page("/blog/")),
      file("src/routes/blog/our-team.tsx", page("/blog/our-team")),
      file("src/routes/shop.products.tsx", page("/shop/products")),
      file("src/routes/incorrect.tsx", page("/other")),
    ])).toEqual([
      { path: "/blog", label: "Blog" },
      { path: "/blog/our-team", label: "Our Team" },
      { path: "/shop/products", label: "Products" },
    ]);
  });

  it("never advertises server endpoints, private files, dynamic routes, or unregistered pages", () => {
    const binary = { kind: "file", path: "src/routes/index.tsx", encoding: "base64", mimeType: "image/png", data: "abcd", sizeBytes: 3 } as WorkspaceSyncEntry;
    expect(registeredTanstackPreviewRoutes([
      file("src/routes/api.orders.tsx", page("/api/orders")),
      file("src/routes/$userId.tsx", page("/$userId")),
      file("src/routes/_layout/settings.tsx", page("/settings")),
      file("src/routes/__root.tsx", page("/")),
      file("src/routes/__internal.tsx", page("/__internal")),
      file("src/routes/route.tsx", page("/")),
      file("src/routes/index.ts", page("/")),
      file("src/pages/sales.tsx", page("/sales")),
      file("src/routes/private.server.tsx", page("/private/server")),
      file("src/routes/without-component.tsx", 'createFileRoute("/without-component")({ server: { handlers: {} } })'),
      binary,
    ])).toEqual([]);
  });

  it("handles duplicate routes safely and reflects saved page deletions", () => {
    const home = file("src/routes/index.tsx", page("/"));
    const team = file("src/routes/team.tsx", page("/team"));
    const duplicates = [file("src/routes/blog.tsx", page("/blog")), file("src/routes/blog/index.tsx", page("/blog/"))];
    expect(registeredTanstackPreviewRoutes([home, team, ...duplicates])).toEqual([
      { path: "/", label: "Home" }, { path: "/team", label: "Team" },
    ]);
    expect(registeredTanstackPreviewRoutes([home])).toEqual([{ path: "/", label: "Home" }]);
    expect(registeredTanstackPreviewRoutes([home, home])).toEqual([]);
  });

  it("wires the browser preview directly to the TanStack page catalog", () => {
    const hook = readFileSync(new URL("../../components/builder/useReactVitePreview.ts", import.meta.url), "utf8");
    expect(hook).toContain('from "@/lib/build/tanstackPreviewPageCatalog"');
    expect(hook).toContain("registeredTanstackPreviewRoutes(initialWorkspaceEntries)");
    expect(hook).not.toContain("registeredReactPreviewRoutes");
  });
});
