"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceSyncEntry } from "@zoeskoul/learner-workspace/runner/runtime";
import { isBinaryWorkspaceEntry } from "@zoeskoul/learner-workspace/lib/ide/workspaceFileContent";

function normalizePath(input: string) {
    return String(input ?? "")
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/+/g, "/")
        .trim();
}

export function normalizeWebPreviewNavigationPath(input: unknown) {
    return normalizePath(String(input ?? "")).replace(/^\/+/, "");
}

function dirname(p: string) {
    const clean = normalizePath(p);
    const idx = clean.lastIndexOf("/");
    return idx >= 0 ? clean.slice(0, idx) : "";
}

function resolveRelativePath(fromFile: string, target: string) {
    const raw = String(target ?? "").trim();
    if (!raw) return "";

    if (
        raw.startsWith("http://") ||
        raw.startsWith("https://") ||
        raw.startsWith("//") ||
        raw.startsWith("data:") ||
        raw.startsWith("blob:") ||
        raw.startsWith("#")
    ) {
        return raw;
    }

    const cleanTarget = raw.split(/[?#]/, 1)[0] ?? "";
    const baseDir = dirname(fromFile);
    const joined = normalizePath(
        baseDir ? `${baseDir}/${cleanTarget}` : cleanTarget,
    );

    const parts = joined.split("/");
    const out: string[] = [];

    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") {
            out.pop();
            continue;
        }
        out.push(part);
    }

    return out.join("/");
}

function buildBinaryDataUrl(entry: WorkspaceSyncEntry) {
    if (!isBinaryWorkspaceEntry(entry)) return "";
    return `data:${entry.mimeType || "application/octet-stream"};base64,${entry.data}`;
}

function rewriteCssAssets(args: {
    css: string;
    cssPath: string;
    assetMap: Map<string, string>;
}) {
    return args.css.replace(
        /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
        (full, quote, target) => {
            const resolved = resolveRelativePath(args.cssPath, target);
            const dataUrl = args.assetMap.get(resolved);
            return dataUrl ? `url("${dataUrl}")` : full;
        },
    );
}

export function listWebPreviewHtmlPaths(entries: WorkspaceSyncEntry[]) {
    const paths: string[] = [];

    for (const entry of entries) {
        if (entry.kind === "directory" || isBinaryWorkspaceEntry(entry)) continue;
        const path = normalizePath(entry.path);
        if (path.toLowerCase().endsWith(".html")) paths.push(path);
    }

    return paths;
}

export function buildWebPreviewSrcDoc(
    entries: WorkspaceSyncEntry[],
    requestedPath = "index.html",
) {
    const fileMap = new Map<string, string>();
    const assetMap = new Map<string, string>();

    for (const entry of entries) {
        if (entry.kind === "directory") continue;
        const path = normalizePath(entry.path);

        if (isBinaryWorkspaceEntry(entry)) {
            assetMap.set(path, buildBinaryDataUrl(entry));
        } else {
            const content = String(entry.content ?? "");
            fileMap.set(path, content);

            if (path.toLowerCase().endsWith(".svg")) {
                assetMap.set(
                    path,
                    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`,
                );
            }
        }
    }

    const requested = normalizePath(requestedPath).replace(/^\/+/, "");
    const htmlPath =
        (requested &&
        requested.toLowerCase().endsWith(".html") &&
        fileMap.has(requested)
            ? requested
            : "") ||
        (fileMap.has("index.html")
            ? "index.html"
            : [...fileMap.keys()].find((path) => path.endsWith(".html")) ?? "");

    const html =
        (htmlPath && fileMap.get(htmlPath)) ||
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Web Preview</title>
  </head>
  <body>
    <main style="font-family: Arial, sans-serif; padding: 24px;">
      <h1>No HTML file found</h1>
      <p>Create an <code>index.html</code> file to start previewing.</p>
    </main>
  </body>
</html>`;

    let out = html;

    out = out.replace(
        /<link\b([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
        (full, before, href) => {
            const resolved = resolveRelativePath(htmlPath || "index.html", href);
            if (!resolved || !resolved.endsWith(".css")) return full;

            const css = fileMap.get(resolved);
            if (typeof css !== "string") return full;

            const rewrittenCss = rewriteCssAssets({
                css,
                cssPath: resolved,
                assetMap,
            });

            return `<style data-inline-href="${resolved}">
${rewrittenCss}
</style>`;
        },
    );

    out = out.replace(
        /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
        (full, before, src, after) => {
            const resolved = resolveRelativePath(htmlPath || "index.html", src);
            if (!resolved || !resolved.endsWith(".js")) return full;

            const js = fileMap.get(resolved);
            if (typeof js !== "string") return full;

            return `<script${before ?? ""}${after ?? ""} data-inline-src="${resolved}">
${js}
<\/script>`;
        },
    );

    out = out.replace(
        /\b(src|poster|href)=(['"])([^'"]+)\2/gi,
        (full, attribute, quote, target) => {
            const resolved = resolveRelativePath(htmlPath || "index.html", target);
            const dataUrl = assetMap.get(resolved);
            return dataUrl ? `${attribute}=${quote}${dataUrl}${quote}` : full;
        },
    );

    out = out.replace(
        /<a\b([^>]*?)href=(['"])([^'"]+)\2([^>]*)>/gi,
        (full, before, quote, href, after) => {
            const resolved = resolveRelativePath(htmlPath || "index.html", href);

            if (
                !resolved ||
                !resolved.toLowerCase().endsWith(".html") ||
                !fileMap.has(resolved)
            ) {
                return full;
            }

            return `<a${before ?? ""}href=${quote}${href}${quote}${after ?? ""} data-zoeskoul-preview-path="/${resolved}">`;
        },
    );

    const navigationBridge = `
<script>
document.addEventListener("click", function (event) {
  var node = event.target;
  var anchor = node && node.closest
    ? node.closest("a[data-zoeskoul-preview-path]")
    : null;
  if (!anchor) return;

  var path = anchor.getAttribute("data-zoeskoul-preview-path");
  if (!path) return;

  event.preventDefault();
  window.parent.postMessage(
    { type: "zoeskoul-web-preview:navigate", path: path },
    "*"
  );
});
<\/script>`;

    const errorBridge = `
<script>
window.addEventListener("error", function (event) {
  const pre = document.createElement("pre");
  pre.textContent = "Preview error: " + (event.message || "Unknown error");
  pre.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:999999;padding:10px 12px;border-radius:12px;background:rgba(127,29,29,.95);color:white;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;";
  document.body.appendChild(pre);
});
<\/script>`;

    const bridges = `${navigationBridge}${errorBridge}`;

    if (out.includes("</body>")) {
        out = out.replace("</body>", `${bridges}</body>`);
    } else {
        out += bridges;
    }

    return out;
}

const DEFAULT_WEB_PREVIEW_URL = "/index.html";

export default function WebPreview(props: {
    entries: WorkspaceSyncEntry[];
    title?: string;
    /**
     * Preferred initial document for reference/expected-result previews.
     * Normal learner Preview omits this and keeps the existing index.html
     * fallback. Navigation remains fully interactive after the initial load.
     */
    entryPath?: string;
}) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const preferredEntryPath = normalizePath(props.entryPath ?? "");
    const [virtualPath, setVirtualPath] = useState(
        preferredEntryPath || DEFAULT_WEB_PREVIEW_URL.slice(1),
    );
    const [refreshRevision, setRefreshRevision] = useState(0);

    const htmlPaths = useMemo(
        () => listWebPreviewHtmlPaths(props.entries),
        [props.entries],
    );

    /**
     * entryPath is an initial/fallback document, not a controlled route.
     * Once the learner navigates to another valid workspace HTML file, keep
     * that virtual path even if the parent rebuilds the solution entries.
     */

    useEffect(() => {
        if (htmlPaths.includes(virtualPath)) return;

        const nextPath =
            (preferredEntryPath && htmlPaths.includes(preferredEntryPath)
                ? preferredEntryPath
                : null) ??
            (htmlPaths.includes("index.html") ? "index.html" : htmlPaths[0]) ??
            DEFAULT_WEB_PREVIEW_URL.slice(1);

        setVirtualPath(nextPath);
    }, [htmlPaths, preferredEntryPath, virtualPath]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;

            const data =
                event.data && typeof event.data === "object"
                    ? (event.data as { type?: unknown; path?: unknown })
                    : null;

            if (data?.type !== "zoeskoul-web-preview:navigate") return;

            const path = normalizeWebPreviewNavigationPath(data.path);

            if (!path || !htmlPaths.includes(path)) return;
            setVirtualPath(path);
        };

        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [htmlPaths]);

    const srcDoc = useMemo(
        () => buildWebPreviewSrcDoc(props.entries, virtualPath),
        [props.entries, virtualPath],
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-white dark:bg-black/40">
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-white/10 dark:bg-neutral-950">
                <button
                    type="button"
                    aria-label="Refresh browser preview"
                    title="Refresh"
                    onClick={() => setRefreshRevision((value) => value + 1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:border-white/10 dark:bg-neutral-900 dark:text-white/70 dark:hover:bg-neutral-800"
                >
                    ↻
                </button>

                <input
                    aria-label="Preview URL"
                    value={`/${virtualPath}`}
                    readOnly
                    data-testid="web-preview-virtual-url"
                    className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[11px] text-neutral-600 outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-white/70"
                />
            </div>

            <div className="min-h-0 flex-1">
                <iframe
                    ref={iframeRef}
                    key={refreshRevision}
                    title={props.title ?? "Web preview"}
                    srcDoc={srcDoc}
                    sandbox="allow-scripts allow-modals"
                    data-web-preview-frame
                    className="h-full w-full border-0 bg-white"
                    style={{
                        colorScheme: "light",
                        backgroundColor: "#ffffff",
                    }}
                />
            </div>
        </div>
    );
}
