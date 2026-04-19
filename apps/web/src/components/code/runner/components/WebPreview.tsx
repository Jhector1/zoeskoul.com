"use client";

import React, { useMemo } from "react";
import type { WorkspaceSyncEntry } from "@/components/code/runner/runtime";

function normalizePath(input: string) {
    return String(input ?? "")
        .replace(/\\/g, "/")
        .replace(/^\.\/+/, "")
        .replace(/\/+/g, "/")
        .trim();
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

    const baseDir = dirname(fromFile);
    const joined = normalizePath(baseDir ? `${baseDir}/${raw}` : raw);
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

function buildSrcDoc(entries: WorkspaceSyncEntry[]) {
    const fileMap = new Map<string, string>();

    for (const entry of entries) {
        if (entry.kind === "directory") continue;
        fileMap.set(normalizePath(entry.path), String(entry.content ?? ""));
    }

    const htmlPath =
        fileMap.has("index.html")
            ? "index.html"
            : [...fileMap.keys()].find((p) => p.endsWith(".html")) ?? "";

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

            return `<style data-inline-href="${resolved}">\n${css}\n</style>`;
        },
    );

    out = out.replace(
        /<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
        (full, before, src, after) => {
            const resolved = resolveRelativePath(htmlPath || "index.html", src);
            if (!resolved || !resolved.endsWith(".js")) return full;

            const js = fileMap.get(resolved);
            if (typeof js !== "string") return full;

            return `<script${before ?? ""}${after ?? ""} data-inline-src="${resolved}">\n${js}\n<\/script>`;
        },
    );

    const errorBridge = `
<script>
window.addEventListener("error", function (event) {
  const pre = document.createElement("pre");
  pre.textContent = "Preview error: " + (event.message || "Unknown error");
  pre.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:999999;padding:10px 12px;border-radius:12px;background:rgba(127,29,29,.95);color:white;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;";
  document.body.appendChild(pre);
});
</script>`;

    if (out.includes("</body>")) {
        out = out.replace("</body>", `${errorBridge}</body>`);
    } else {
        out += errorBridge;
    }

    return out;
}

export default function WebPreview(props: {
    entries: WorkspaceSyncEntry[];
    title?: string;
}) {
    const srcDoc = useMemo(() => buildSrcDoc(props.entries), [props.entries]);

    return (
        <div className="h-full min-h-0 border-t border-neutral-200 bg-white/80  dark:border-white/10 dark:bg-black/40">
            <div className="mb-2 p-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-extrabold text-neutral-600 dark:text-white/60">
                    {props.title ?? "Preview"}
                </div>
            </div>

            <div className="h-[calc(100%-28px)] min-h-0 overflow-hidden  border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950">
                <iframe
                    title={props.title ?? "Web Preview"}
                    srcDoc={srcDoc}
                    sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                    className="h-full w-full border-0 bg-white"
                />
            </div>
        </div>
    );
}