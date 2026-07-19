import crypto from "node:crypto";
import JSZip from "jszip";
import type { FileEntry } from "./types";
import type {
    BinaryWorkspaceFileEntry,
    InteractiveLanguage,
} from "@zoeskoul/code-contracts";
import {
    WORKSPACE_BINARY_CAPABILITIES,
    WORKSPACE_DENIED_HIDDEN_BASENAMES,
    WORKSPACE_TEXT_BASENAMES,
    WORKSPACE_TEXT_EXTENSIONS,
    assertWorkspaceRelativePath,
    normalizeWorkspaceBase64,
    resolveWorkspaceFileCapability,
    workspaceBase64DecodedByteLength,
} from "@zoeskoul/code-contracts";

type ProjectLanguage = InteractiveLanguage | "bash";


const PY_TEXT_EXTENSIONS = JSON.stringify(JSON.stringify([...WORKSPACE_TEXT_EXTENSIONS]));
const PY_TEXT_BASENAMES = JSON.stringify(JSON.stringify([...WORKSPACE_TEXT_BASENAMES]));
const PY_BINARY_MIME = JSON.stringify(
    JSON.stringify(
        Object.fromEntries(
            (
                Object.entries(WORKSPACE_BINARY_CAPABILITIES) as Array<
                    [string, { mimeType: string }]
                >
            ).map(([extension, value]) => [extension, value.mimeType]),
        ),
    ),
);
const PY_DENIED_HIDDEN_BASENAMES = JSON.stringify(
    JSON.stringify([...WORKSPACE_DENIED_HIDDEN_BASENAMES]),
);

const SNAPSHOT_SCRIPT = String.raw`#!/usr/bin/env python3
import base64
import hashlib
import json
import mimetypes
import os
import sys

MAX_ENTRIES = 400
MAX_TEXT_FILE_BYTES = 256 * 1024
MAX_BINARY_FILE_BYTES = 5 * 1024 * 1024
MAX_TEXT_TOTAL_BYTES = 5 * 1024 * 1024
MAX_BINARY_TOTAL_BYTES = 8 * 1024 * 1024

IGNORED_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", "target",
    "__pycache__", ".cache", ".zoeskoul",
}
IGNORED_FILES = {
    "run", "run.sh", "compile", "compile.sh", ".zoe_capture_workspace.py",
}
TEXT_EXTENSIONS = set(json.loads(${PY_TEXT_EXTENSIONS}))
TEXT_BASENAMES = set(json.loads(${PY_TEXT_BASENAMES}))
BINARY_MIME = json.loads(${PY_BINARY_MIME})
DENIED_HIDDEN_BASENAMES = set(json.loads(${PY_DENIED_HIDDEN_BASENAMES}))


def safe_rel(path):
    rel = os.path.relpath(path, ".").replace(os.sep, "/")
    if rel == ".":
        return ""
    if rel.startswith("../") or rel.startswith("/") or "\x00" in rel:
        return ""
    parts = [part for part in rel.split("/") if part]
    if any(part in {".", ".."} for part in parts):
        return ""
    return "/".join(parts)


def classify_file(rel):
    base = os.path.basename(rel)
    if base in IGNORED_FILES:
        return None
    ext = os.path.splitext(base)[1].lower()
    if base in TEXT_BASENAMES or ext in TEXT_EXTENSIONS:
        return ("text", mimetypes.guess_type(base)[0] or "text/plain")
    if ext in BINARY_MIME:
        return ("binary", BINARY_MIME[ext])
    if base.startswith(".") and base not in DENIED_HIDDEN_BASENAMES and not base.startswith(".env."):
        return ("text", "text/plain")
    return None


def main():
    entries = []
    text_total = 0
    binary_total = 0

    for root, dirs, files in os.walk("."):
        dirs[:] = sorted([directory for directory in dirs if directory not in IGNORED_DIRS])

        rel_root = safe_rel(root)
        if rel_root:
            entries.append({"kind": "directory", "path": rel_root})

        for name in sorted(files):
            full = os.path.join(root, name)
            rel = safe_rel(full)
            classification = classify_file(rel) if rel else None
            if not classification:
                continue

            try:
                size = os.path.getsize(full)
            except OSError:
                continue

            storage, mime_type = classification
            if storage == "text":
                if size > MAX_TEXT_FILE_BYTES:
                    raise RuntimeError("Workspace text file exceeds the per-file snapshot limit: " + rel)
                if text_total + size > MAX_TEXT_TOTAL_BYTES:
                    raise RuntimeError("Workspace text snapshot exceeds the total size limit")
                try:
                    with open(full, "r", encoding="utf-8") as source:
                        content = source.read()
                except UnicodeDecodeError as error:
                    raise RuntimeError("Workspace text file is not valid UTF-8: " + rel) from error
                except OSError:
                    continue
                text_total += size
                entries.append({"kind": "file", "path": rel, "content": content})
            else:
                if size > MAX_BINARY_FILE_BYTES:
                    raise RuntimeError("Workspace binary file exceeds the per-file snapshot limit: " + rel)
                if binary_total + size > MAX_BINARY_TOTAL_BYTES:
                    raise RuntimeError("Workspace binary snapshot exceeds the total size limit")
                try:
                    with open(full, "rb") as source:
                        data = source.read()
                except Exception:
                    continue
                binary_total += size
                entries.append({
                    "kind": "file",
                    "path": rel,
                    "encoding": "base64",
                    "data": base64.b64encode(data).decode("ascii"),
                    "mimeType": mime_type,
                    "sizeBytes": len(data),
                    "checksum": "sha256:" + hashlib.sha256(data).hexdigest(),
                })

            if len(entries) > MAX_ENTRIES:
                raise RuntimeError("Workspace snapshot exceeds the entry limit")

        if len(entries) > MAX_ENTRIES:
            raise RuntimeError("Workspace snapshot exceeds the entry limit")

    entries.sort(key=lambda entry: (entry.get("path", ""), 0 if entry.get("kind") == "directory" else 1))
    payload = base64.b64encode(json.dumps(entries, separators=(",", ":")).encode("utf-8")).decode("ascii")

    sys.stdout.write("\n__ZOE_WORKSPACE_SNAPSHOT_B64__")
    sys.stdout.write(payload)
    sys.stdout.write("__END_ZOE_WORKSPACE_SNAPSHOT_B64__\n")


if __name__ == "__main__":
    main()
`;


function isBinaryFileEntry(file: FileEntry): file is BinaryWorkspaceFileEntry {
    return (file as BinaryWorkspaceFileEntry).encoding === "base64";
}

function pickJavaMainClass(entryPath: string, files: FileEntry[]): string {
    const entry = files.find((file) => file.path === entryPath);
    const src = entry && !isBinaryFileEntry(entry) ? entry.content ?? "" : "";
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

function unreachableProjectLanguage(value: never): never {
    throw new Error(`Unsupported project language: ${String(value)}`);
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
            default:
                return unreachableProjectLanguage(lang);
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
            default:
                return unreachableProjectLanguage(lang);
        }
    })();

    return { compile, run };
}

export async function zipProject(
    lang: ProjectLanguage,
    entry: string,
    files: FileEntry[],
) {
    const safeEntry = assertWorkspaceRelativePath(entry);
    const zip = new JSZip();

    const seenPaths = new Set<string>();
    const normalizedFiles: FileEntry[] = files.map((file) => {
        const path = assertWorkspaceRelativePath(file.path);
        if (seenPaths.has(path)) {
            throw new Error(`Duplicate project file path: ${path}`);
        }
        seenPaths.add(path);

        const capability = resolveWorkspaceFileCapability(path);
        if (!capability) {
            throw new Error(`Unsupported project file type: ${path}`);
        }

        if (isBinaryFileEntry(file)) {
            const data = normalizeWorkspaceBase64(file.data);
            const sizeBytes = workspaceBase64DecodedByteLength(file.data);
            if (
                capability.storage !== "binary" ||
                data == null ||
                sizeBytes == null ||
                sizeBytes !== file.sizeBytes
            ) {
                throw new Error(`Invalid binary project file: ${path}`);
            }

            const bytes = Buffer.from(data, "base64");
            const declaredChecksum =
                typeof file.checksum === "string" && file.checksum.trim()
                    ? file.checksum.trim().toLowerCase()
                    : undefined;
            if (
                declaredChecksum &&
                !/^sha256:[a-f0-9]{64}$/.test(declaredChecksum)
            ) {
                throw new Error(`Invalid binary checksum: ${path}`);
            }

            const actualChecksum = `sha256:${crypto
                .createHash("sha256")
                .update(bytes)
                .digest("hex")}`;
            if (declaredChecksum && declaredChecksum !== actualChecksum) {
                throw new Error(`Binary checksum mismatch: ${path}`);
            }

            return {
                kind: "file",
                path,
                encoding: "base64",
                data,
                mimeType: capability.mimeType,
                sizeBytes,
                checksum: declaredChecksum ?? actualChecksum,
            };
        }

        if (capability.storage !== "text") {
            throw new Error(`Binary project file must use base64 encoding: ${path}`);
        }

        return {
            kind: "file",
            path,
            content: String(file.content ?? ""),
        };
    });

    const entryFile = normalizedFiles.find((file) => file.path === safeEntry);
    if (!entryFile) {
        throw new Error(`Project entry file is missing: ${safeEntry}`);
    }
    if (isBinaryFileEntry(entryFile)) {
        throw new Error("Project entry files must be text files.");
    }

    for (const file of normalizedFiles) {
        if (isBinaryFileEntry(file)) {
            zip.file(file.path, file.data, { base64: true, binary: true });
        } else {
            zip.file(file.path, file.content);
        }
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
