import fs from "node:fs";
import path from "node:path";

function findRepoRoot(start = process.cwd()): string {
    let current = path.resolve(start);

    while (true) {
        const hasWorkspace = fs.existsSync(path.join(current, "pnpm-workspace.yaml"));
        const hasGit = fs.existsSync(path.join(current, ".git"));

        if (hasWorkspace || hasGit) return current;

        const parent = path.dirname(current);
        if (parent === current) {
            throw new Error("Could not find repo root from current working directory.");
        }
        current = parent;
    }
}

let cachedRepoRoot: string | null = null;

export function getRepoRoot(): string {
    if (!cachedRepoRoot) cachedRepoRoot = findRepoRoot();
    return cachedRepoRoot;
}

export function fromRepoRoot(...parts: string[]) {
    return path.join(getRepoRoot(), ...parts);
}