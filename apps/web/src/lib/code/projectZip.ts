import JSZip from "jszip";
import type { FileEntry } from "./types";
import { CodeLanguage } from "@/lib/practice/types";
import {InteractiveLanguage} from "@zoeskoul/code-contracts";

type ProjectLanguage = InteractiveLanguage;

function assertSafeRelPath(p: string) {
    if (!p || p.startsWith("/") || p.includes("..")) {
        throw new Error(`Unsafe path: ${p}`);
    }
}

function pickJavaMainClass(entryPath: string, files: FileEntry[]): string {
    const src = files.find((f) => f.path === entryPath)?.content ?? "";
    const pkg = /package\s+([a-zA-Z0-9_.]+)\s*;/.exec(src)?.[1];
    const cls =
        /public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)/.exec(src)?.[1] ??
        /class\s+([A-Za-z0-9_]+)/.exec(src)?.[1];

    if (!cls) return "Main";
    return pkg ? `${pkg}.${cls}` : cls;
}

function scriptsFor(lang: ProjectLanguage, entry: string, files: FileEntry[]) {
    const mainClass = lang === "java" ? pickJavaMainClass(entry, files) : "";

    const run: string = (() => {
        switch (lang) {
            case "python":
                return `#!/usr/bin/env bash
set -euo pipefail
ENTRY="${entry}"
export PYTHONPATH="$(pwd):$(pwd)/src:\${PYTHONPATH:-}"
python3 "$ENTRY"
`;
            case "javascript":
                return `#!/usr/bin/env bash
set -euo pipefail
ENTRY="${entry}"
node "$ENTRY"
`;
            case "java":
                return `#!/usr/bin/env bash
set -euo pipefail
java -cp build "${mainClass}"
`;
            case "c":
            case "cpp":
                return `#!/usr/bin/env bash
set -euo pipefail
./build/app
`;
        }
    })();

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
                return null;
        }
    })();

    return { compile, run };
}

export async function zipProject(lang: ProjectLanguage, entry: string, files: FileEntry[]) {
    assertSafeRelPath(entry);
    const zip = new JSZip();

    for (const f of files) {
        assertSafeRelPath(f.path);
        zip.file(f.path, f.content ?? "");
    }

    const { compile, run } = scriptsFor(lang, entry, files);

    if (compile) {
        zip.file("compile", compile);
        zip.file("compile.sh", compile);
    }

    zip.file("run", run);
    zip.file("run.sh", run);

    const buf = await zip.generateAsync({ type: "nodebuffer" });
    return buf.toString("base64");
}