export type SqlCell = string | number | boolean | null;

export type SqlTable = {
    columns: string[];
    rows: SqlCell[][];
};

export type SqlRunResult = {
    ok?: boolean;
    columns?: Array<string | { name?: string }>;
    rows?: unknown[][];
    tables?: Array<{
        columns?: Array<string | { name?: string }>;
        rows?: unknown[][];
    }>;
    result?: {
        tables?: Array<{
            columns?: Array<string | { name?: string }>;
            rows?: unknown[][];
        }>;
    };
    sql?: {
        statements?: Array<{
            table?: {
                columns?: Array<string | { name?: string }>;
                rows?: unknown[][];
            };
        }>;
    };
    output?: {
        tables?: Array<{
            columns?: Array<string | { name?: string }>;
            rows?: unknown[][];
        }>;
    };
};