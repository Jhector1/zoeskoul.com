import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import {InteractiveLanguage} from "@zoeskoul/code-contracts"
export type SqlScalar = string | number | boolean | null;

export type FileEntry = {
    path: string;
    content: string;
};

export type RunLimits = {
    cpu_time_limit?: number;
    cpu_extra_time?: number;
    wall_time_limit?: number;
    memory_limit?: number;
    stack_limit?: number;
    max_processes_and_or_threads?: number;
    enable_network?: boolean;
    number_of_runs?: number;
};

export type InteractiveRunLimits = RunLimits & {
    idle_timeout_ms?: number;
    max_output_bytes?: number;
};

export type SqlRunLimits = {
    statementTimeoutMs?: number;
    maxRows?: number;
    maxBytes?: number;
};


export type{ InteractiveLanguage } ;
