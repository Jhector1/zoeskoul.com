import { createLocalSqlRunner } from "./localRunner.js";

export type RunSqlFn = (args: {
    code: string;
    checkSql?: string;
    dialect: string;
    schemaSql?: string;
    seedSql?: string;
    datasetId?: string;
    limits?: {
        statementTimeoutMs?: number;
        maxRows?: number;
        maxBytes?: number;
    };
}) => Promise<unknown>;

let currentSqlRunner: RunSqlFn | null = null;
let fallbackSqlRunner: RunSqlFn | null | undefined;

export function setSqlRunner(fn: RunSqlFn) {
    currentSqlRunner = fn;
}

export function clearSqlRunner() {
    currentSqlRunner = null;
}

export function getSqlRunner(): RunSqlFn | null {
    return currentSqlRunner;
}

export function resolveSqlRunner(): RunSqlFn | null {
    if (currentSqlRunner) return currentSqlRunner;
    if (fallbackSqlRunner !== undefined) return fallbackSqlRunner;
    fallbackSqlRunner = createLocalSqlRunner();
    return fallbackSqlRunner;
}
