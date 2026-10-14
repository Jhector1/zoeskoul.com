"use client";

import React, {
    useEffect,
    useId,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import type { WorkspaceSyncEntry } from "@zoeskoul/learner-workspace/runner/runtime";
import { isBinaryWorkspaceEntry } from "@zoeskoul/learner-workspace/lib/ide/workspaceFileContent";
import WebConsole from "./WebConsole";
import {
    acceptWebPreviewBridgeMessage,
    buildWebPreviewBridgeScript,
    webPreviewConsoleReducer,
} from "./webPreviewBridge";

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

function webPreviewVirtualContentType(path: string) {
    const lower = path.toLowerCase();

    if (lower.endsWith(".json")) return "application/json; charset=utf-8";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        return "text/html; charset=utf-8";
    }
    if (lower.endsWith(".css")) return "text/css; charset=utf-8";
    if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
        return "text/javascript; charset=utf-8";
    }
    if (lower.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
    if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";

    return "text/plain; charset=utf-8";
}

function buildWebPreviewVirtualFetchScript(
    fileMap: Map<string, string>,
    htmlPath: string,
) {
    const resources = Object.fromEntries(
        [...fileMap.entries()].map(([path, content]) => [
            path,
            {
                body: content,
                contentType: webPreviewVirtualContentType(path),
            },
        ]),
    );

    const serializedResources = JSON.stringify(resources).replace(
        /</g,
        "\\u003c",
    );
    const serializedPagePath = JSON.stringify(htmlPath || "index.html").replace(
        /</g,
        "\\u003c",
    );

    return `
<script>
(function () {
  var resources = ${serializedResources};
  var pagePath = ${serializedPagePath};
  var nativeFetch = window.fetch.bind(window);

  function normalizeVirtualPath(value) {
    var parts = String(value || "").replace(/\\\\/g, "/").split("/");
    var out = [];

    for (var index = 0; index < parts.length; index += 1) {
      var part = parts[index];
      if (!part || part === ".") continue;

      if (part === "..") {
        out.pop();
        continue;
      }

      out.push(part);
    }

    return out.join("/");
  }

  function resolveVirtualPath(target) {
    var raw = String(target || "");

    var hashIndex = raw.indexOf("#");
    if (hashIndex >= 0) raw = raw.slice(0, hashIndex);

    var queryIndex = raw.indexOf("?");
    if (queryIndex >= 0) raw = raw.slice(0, queryIndex);

    if (!raw) return "";

    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.slice(0, 2) === "//") {
      return "";
    }

    if (raw.charAt(0) === "/") {
      return normalizeVirtualPath(raw.slice(1));
    }

    var currentPage = normalizeVirtualPath(pagePath);
    var slashIndex = currentPage.lastIndexOf("/");
    var baseDirectory =
      slashIndex >= 0 ? currentPage.slice(0, slashIndex + 1) : "";

    return normalizeVirtualPath(baseDirectory + raw);
  }

  window.fetch = function zoeskoulVirtualWorkspaceFetch(input, init) {
    var raw =
      typeof input === "string"
        ? input
        : input && typeof input.url === "string"
          ? input.url
          : "";

    var method = String(
      (init && init.method) ||
        (input && typeof input.method === "string" ? input.method : "GET"),
    ).toUpperCase();

    var virtualPath = resolveVirtualPath(raw);
    var isVirtualMethod = method === "GET" || method === "HEAD";

    if (
      virtualPath &&
      isVirtualMethod &&
      Object.prototype.hasOwnProperty.call(resources, virtualPath)
    ) {
      var resource = resources[virtualPath];

      return Promise.resolve(
        new Response(method === "HEAD" ? null : resource.body, {
          status: 200,
          statusText: "OK",
          headers: {
            "Content-Type": resource.contentType,
          },
        }),
      );
    }

    var isRelativeOrRootPath =
      raw &&
      !/^[a-z][a-z0-9+.-]*:/i.test(raw) &&
      raw.slice(0, 2) !== "//";

    if (isRelativeOrRootPath && isVirtualMethod) {
      return Promise.resolve(
        new Response(method === "HEAD" ? null : "Not Found", {
          status: 404,
          statusText: "Not Found",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        }),
      );
    }

    return nativeFetch(input, init);
  };
})();
<\/script>`;
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
    options?: { bridgeId?: string },
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
</script>`;
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

    const bridge = buildWebPreviewBridgeScript(options?.bridgeId ?? "standalone");
    const virtualFetchBridge = buildWebPreviewVirtualFetchScript(
        fileMap,
        htmlPath || "index.html",
    );
    const headMatch = /<head(?:\s[^>]*)?>/i.exec(out);
    if (headMatch) {
        const insertionPoint = (headMatch.index ?? 0) + headMatch[0].length;
        out = `${out.slice(0, insertionPoint)}${bridge}${virtualFetchBridge}${out.slice(insertionPoint)}`;
    } else {
        out = `${bridge}${virtualFetchBridge}${out}`;
    }

    return out;
}

const DEFAULT_WEB_PREVIEW_URL = "/index.html";
export function hashWebPreviewContent(
    entries: WorkspaceSyncEntry[],
    path: string,
) {
    let hash = 2_166_136_261;
    const update = (value: string) => {
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16_777_619);
        }
    };

    /**
     * Workspace entry ordering is presentation/editor state, not preview
     * content identity. Switching active files can cause the same workspace
     * files to be emitted in a different array order. Hash a canonical
     * projection so file selection does not create a false preview session.
     */
    const canonicalEntries = entries
        .map((entry) => ({
            kind: entry.kind ?? "file",
            path: normalizePath(entry.path),
            content:
                entry.kind === "directory"
                    ? ""
                    : isBinaryWorkspaceEntry(entry)
                      ? entry.data
                      : String(entry.content ?? ""),
        }))
        .sort(
            (left, right) =>
                left.path.localeCompare(right.path) ||
                left.kind.localeCompare(right.kind) ||
                left.content.localeCompare(right.content),
        );

    update(path);

    for (const entry of canonicalEntries) {
        update(entry.kind);
        update(entry.path);
        update(entry.content);
    }

    return (hash >>> 0).toString(36);
}

export default function WebPreview(props: {
    entries: WorkspaceSyncEntry[];
    title?: string;
    /**
     * Preferred initial document for reference/expected-result previews.
     * Normal learner Preview omits this and keeps the existing index.html
     * fallback. Navigation remains fully interactive after the initial load.
     */
    entryPath?: string;
    /** Generic presentation option for console-first web experiences. */
    consoleInitiallyOpen?: boolean;
    /** Resets iframe diagnostics when the owning workspace/exercise changes. */
    sessionKey?: string;
}) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const componentId = useId();
    const preferredEntryPath = normalizePath(props.entryPath ?? "");
    const [virtualPath, setVirtualPath] = useState(
        preferredEntryPath || DEFAULT_WEB_PREVIEW_URL.slice(1),
    );
    const [refreshRevision, setRefreshRevision] = useState(0);
    const [consoleOpen, setConsoleOpen] = useState(
        props.consoleInitiallyOpen ?? false,
    );
    const [unreadCount, setUnreadCount] = useState(0);
    const consoleOpenRef = useRef(consoleOpen);

    const htmlPaths = useMemo(
        () => listWebPreviewHtmlPaths(props.entries),
        [props.entries],
    );
    const contentIdentity = useMemo(
        () =>
            hashWebPreviewContent(
                props.entries,
                `${props.sessionKey ?? ""}\0${virtualPath}`,
            ),
        [props.entries, props.sessionKey, virtualPath],
    );
    const bridgeId = `${componentId}:${contentIdentity}:${refreshRevision}`;
    const [consoleState, dispatchConsole] = useReducer(webPreviewConsoleReducer, {
        sessionId: bridgeId,
        entries: [],
    });
    const consoleEntries =
        consoleState.sessionId === bridgeId ? consoleState.entries : [];

    useEffect(() => {
        consoleOpenRef.current = consoleOpen;
    }, [consoleOpen]);

    useEffect(() => {
        dispatchConsole({ type: "reset-session", sessionId: bridgeId });
        setUnreadCount(0);
        setConsoleOpen(props.consoleInitiallyOpen ?? false);
    }, [bridgeId, props.consoleInitiallyOpen]);

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
            const message = acceptWebPreviewBridgeMessage({
                eventSource: event.source,
                activeIframeWindow: iframeRef.current?.contentWindow,
                data: event.data,
                bridgeId,
            });
            if (!message) return;

            if (message.kind === "navigate") {
                const path = normalizeWebPreviewNavigationPath(message.path);
                if (!path || !htmlPaths.includes(path)) return;
                setVirtualPath(path);
                return;
            }

            if (message.kind !== "console-entry") return;
            dispatchConsole({
                type: "append",
                sessionId: bridgeId,
                entry: message.entry,
            });

            if (
                message.entry.kind === "runtime-error" ||
                message.entry.kind === "unhandled-rejection"
            ) {
                consoleOpenRef.current = true;
                setConsoleOpen(true);
                setUnreadCount(0);
            } else if (!consoleOpenRef.current) {
                setUnreadCount((current) => current + 1);
            }
        };

        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [bridgeId, htmlPaths]);

    const srcDoc = useMemo(
        () =>
            buildWebPreviewSrcDoc(props.entries, virtualPath, {
                bridgeId,
            }),
        [bridgeId, props.entries, virtualPath],
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
                    sandbox="allow-scripts allow-forms allow-modals"
                    onLoad={(event) => {
                        event.currentTarget.contentWindow?.postMessage(
                            {
                                type: "zoeskoul-web-preview:bridge",
                                bridgeId,
                                kind: "connect",
                            },
                            "*",
                        );
                    }}
                    data-web-preview-frame
                    className="h-full w-full border-0 bg-white"
                    style={{
                        colorScheme: "light",
                        backgroundColor: "#ffffff",
                    }}
                />
            </div>

            <WebConsole
                entries={consoleEntries}
                open={consoleOpen}
                unreadCount={unreadCount}
                onOpenChange={(open) => {
                    consoleOpenRef.current = open;
                    setConsoleOpen(open);
                    if (open) setUnreadCount(0);
                }}
                onClear={() => {
                    dispatchConsole({ type: "clear", sessionId: bridgeId });
                    setUnreadCount(0);
                }}
            />
        </div>
    );
}
