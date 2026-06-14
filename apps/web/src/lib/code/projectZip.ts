import JSZip from "jszip";
import type { FileEntry } from "./types";
import type { InteractiveLanguage } from "@zoeskoul/code-contracts";

type ProjectLanguage = InteractiveLanguage | "bash";

const SNAPSHOT_SCRIPT = String.raw`#!/usr/bin/env python3
import base64
import json
import os
import sys

MAX_ENTRIES = 400
MAX_FILE_BYTES = 256 * 1024
MAX_TOTAL_BYTES = 5 * 1024 * 1024

IGNORED_DIRS = {
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    "target",
    "__pycache__",
    ".cache",
}

IGNORED_FILES = {
    "run",
    "run.sh",
    "compile",
    "compile.sh",
    ".zoe_capture_workspace.py",
}

ALLOWED_EXTENSIONS = {
    ".py", ".js", ".ts", ".java",
    ".c", ".cc", ".cpp", ".cxx",
    ".h", ".hh", ".hpp",
    ".sh", ".txt", ".md", ".json",
    ".yaml", ".yml", ".xml", ".csv", ".sql",
    ".tmp", ".log",
}

ALLOWED_BASENAMES = {
    "Makefile",
    "README",
    "README.md",
    "readme.md",
}

def safe_rel(path):
    rel = os.path.relpath(path, ".").replace(os.sep, "/")
    if rel == ".":
        return ""
    if rel.startswith("../") or rel.startswith("/") or "\x00" in rel:
        return ""
    parts = [p for p in rel.split("/") if p]
    if any(p in {".", ".."} for p in parts):
        return ""
    return "/".join(parts)

def allowed_file(rel):
    base = os.path.basename(rel)
    if base in IGNORED_FILES:
        return False
    if base in ALLOWED_BASENAMES:
        return True
    _, ext = os.path.splitext(base)
    return ext.lower() in ALLOWED_EXTENSIONS

def main():
    entries = []
    total = 0

    for root, dirs, files in os.walk("."):
        dirs[:] = sorted([d for d in dirs if d not in IGNORED_DIRS])

        rel_root = safe_rel(root)
        if rel_root:
            entries.append({"kind": "directory", "path": rel_root})

        for name in sorted(files):
            full = os.path.join(root, name)
            rel = safe_rel(full)
            if not rel or not allowed_file(rel):
                continue

            try:
                size = os.path.getsize(full)
            except OSError:
                continue

            if size > MAX_FILE_BYTES:
                continue

            if total + size > MAX_TOTAL_BYTES:
                continue

            try:
                with open(full, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue

            total += size
            entries.append({
                "kind": "file",
                "path": rel,
                "content": content,
            })

            if len(entries) >= MAX_ENTRIES:
                break

        if len(entries) >= MAX_ENTRIES:
            break

    entries.sort(key=lambda e: (e.get("path", ""), 0 if e.get("kind") == "directory" else 1))
    payload = base64.b64encode(json.dumps(entries, separators=(",", ":")).encode("utf-8")).decode("ascii")

    sys.stdout.write("\n__ZOE_WORKSPACE_SNAPSHOT_B64__")
    sys.stdout.write(payload)
    sys.stdout.write("__END_ZOE_WORKSPACE_SNAPSHOT_B64__\n")

if __name__ == "__main__":
    main()
`;

function normalizeRelPath(input: string) {
    return String(input ?? "").replace(/\\/g, "/").trim();
}

function assertSafeRelPath(p: string) {
    const normalized = normalizeRelPath(p);

    if (!normalized) {
        throw new Error("Unsafe empty path.");
    }

    if (
        normalized.startsWith("/") ||
        normalized.includes("\0") ||
        /^[A-Za-z]:[\\/]/.test(normalized)
    ) {
        throw new Error(`Unsafe path: ${p}`);
    }

    const parts = normalized.split("/");

    if (
        parts.some(
            (part) =>
                !part ||
                part === "." ||
                part === ".." ||
                part.includes("\0"),
        )
    ) {
        throw new Error(`Unsafe path: ${p}`);
    }

    return parts.join("/");
}

function pickJavaMainClass(entryPath: string, files: FileEntry[]): string {
    const src = files.find((f) => f.path === entryPath)?.content ?? "";
    const pkg = /package\s+([a-zA-Z0-9_.]+)\s*;/.exec(src)?.[1];

    const cls =
        /public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)/.exec(
            src,
        )?.[1] ??
        /class\s+([A-Za-z0-9_]+)/.exec(src)?.[1];

    if (!cls) return "Main";
    return pkg ? `${pkg}.${cls}` : cls;
}

function wrapRunScript(body: string) {
    return `#!/usr/bin/env bash
set -uo pipefail

__zoe_capture_workspace() {
    python3 .zoe_capture_workspace.py || true
}

trap '__zoe_status=$?; __zoe_capture_workspace; exit $__zoe_status' EXIT

${body}
`;
}

function scriptsFor(lang: ProjectLanguage, entry: string, files: FileEntry[]) {
    const mainClass = lang === "java" ? pickJavaMainClass(entry, files) : "";

    const runBody: string = (() => {
        switch (lang) {
            case "python":
                return `ENTRY="${entry}"
export PYTHONPATH="$(pwd):$(pwd)/src:\${PYTHONPATH:-}"
python3 "$ENTRY"
`;
            case "javascript":
                return `ENTRY="${entry}"
node "$ENTRY"
`;
            case "java":
                return `java -cp build "${mainClass}"
`;
            case "c":
            case "cpp":
                return `./build/app
`;
            case "bash":
                return `bash "${entry}"
`;
        }
    })();

    const run = wrapRunScript(runBody);

    const compile: string | null = (() => {
        switch (lang) {
            case "java":
                return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
FILES=$(find . -name "*.java" -not -path "./build/*")
javac -d build $FILES
`;
            case "c":
                return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
FILES=$(find . -name "*.c" -not -path "./build/*")
gcc -O2 -std=c11 -I. -o build/app $FILES
`;
            case "cpp":
                return `#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
FILES=$(find . -name "*.cpp" -not -path "./build/*")
g++ -O2 -std=c++17 -I. -o build/app $FILES
`;
            case "python":
            case "javascript":
            case "bash":
                return null;
        }
    })();

    return { compile, run };
}

export async function zipProject(
    lang: ProjectLanguage,
    entry: string,
    files: FileEntry[],
) {
    const safeEntry = assertSafeRelPath(entry);
    const zip = new JSZip();

    const normalizedFiles = files.map((file) => ({
        path: assertSafeRelPath(file.path),
        content: String(file.content ?? ""),
    }));

    for (const file of normalizedFiles) {
        zip.file(file.path, file.content);
    }

    const { compile, run } = scriptsFor(lang, safeEntry, normalizedFiles);

    if (compile) {
        zip.file("compile", compile);
        zip.file("compile.sh", compile);
    }

    zip.file(".zoe_capture_workspace.py", SNAPSHOT_SCRIPT);
    zip.file("run", run);
    zip.file("run.sh", run);

    const buf = await zip.generateAsync({ type: "nodebuffer" });
    return buf.toString("base64");
}
