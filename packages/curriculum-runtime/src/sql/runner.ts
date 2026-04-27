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

export function setSqlRunner(fn: RunSqlFn) {
    currentSqlRunner = fn;
}

export function getSqlRunner(): RunSqlFn | null {
    return currentSqlRunner;
}