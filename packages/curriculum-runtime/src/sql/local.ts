import { createLocalSqlRunner } from "./localRunner.js";
import { getSqlRunner, type RunSqlFn } from "./runner.js";

let fallbackSqlRunner: RunSqlFn | null | undefined;

/**
 * Resolves the configured SQL runner first, then lazily falls back to the
 * optional local SQLite adapter. This entry point is server/compiler-only so
 * web consumers of the pure SQL validation API do not bundle local drivers.
 */
export function resolveSqlRunner(): RunSqlFn | null {
    const configured = getSqlRunner();
    if (configured) return configured;

    if (fallbackSqlRunner === undefined) {
        fallbackSqlRunner = createLocalSqlRunner();
    }

    return fallbackSqlRunner;
}

export { createLocalSqlRunner } from "./localRunner.js";
