// scripts/_shared/generator-common.ts
import { promises as fs } from "node:fs";
import path from "node:path";

export const projectRoot = process.cwd();

export async function exists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

export async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

export async function readJsonFile<T>(file: string): Promise<T> {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
}

export async function getDirectories(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
}

export async function walkFiles(
    dir: string,
    match: (fullPath: string, entryName: string) => boolean,
): Promise<string[]> {
    const out: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            out.push(...(await walkFiles(full, match)));
            continue;
        }

        if (entry.isFile() && match(full, entry.name)) {
            out.push(full);
        }
    }

    return out.sort((a, b) => a.localeCompare(b));
}

export async function findSubjectManifestFiles(subjectsRoot: string): Promise<string[]> {
    const files = await walkFiles(
        subjectsRoot,
        (fullPath, entryName) =>
            entryName === "subject.manifest.json" &&
            path.basename(path.dirname(fullPath)) !== "_core",
    );

    return files.filter((file) => {
        const relativeDir = getSubjectRelativeDir(subjectsRoot, file);
        return relativeDir.includes("/");
    });
}

export function getSubjectRelativeDir(subjectsRoot: string, manifestFile: string): string {
    return path.relative(subjectsRoot, path.dirname(manifestFile)).replace(/\\/g, "/");
}

export function toPosixImportPath(fromFileDir: string, targetFile: string): string {
    const rel = path.relative(fromFileDir, targetFile).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : `./${rel}`;
}

export function toSafeIdentifier(
    input: string,
    fallback = "manifest",
    numericPrefix = "m",
): string {
    const cleaned = input
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch: string) => ch.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, "");

    const base = cleaned.length ? cleaned : fallback;
    return /^[0-9]/.test(base) ? `${numericPrefix}${base}` : base;
}

export function readFlag(name: string, argv = process.argv.slice(2)): string | null {
    const idx = argv.indexOf(`--${name}`);
    if (idx === -1) return null;
    return argv[idx + 1] ?? null;
}

export function hasFlag(name: string, argv = process.argv.slice(2)): boolean {
    return argv.includes(`--${name}`);
}

export function assertUnique(values: string[], label: string, context: string): void {
    const seen = new Set<string>();

    for (const value of values) {
        if (seen.has(value)) {
            throw new Error(`Duplicate ${label} "${value}" found while generating ${context}`);
        }
        seen.add(value);
    }
}

export async function writeTextFile(file: string, content: string): Promise<void> {
    await ensureDir(path.dirname(file));
    await fs.writeFile(file, content, "utf8");
}

export function relFromProject(absPath: string): string {
    return path.relative(projectRoot, absPath);
}
