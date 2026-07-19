export type ToolSurface = "editor" | "results";
export type SqlPaneTab = "results" | "tables" | "erd" | "chen";
export type RunnerPaneTab = "output" | "terminal";

export type ToolRunnerPanePolicy = {
    /** Preferred runner tab on the full desktop Results surface. */
    defaultTab?: RunnerPaneTab;
    /** Preferred runner tab on compact/stacked layouts. */
    compactDefaultTab?: RunnerPaneTab;
};

export type ToolSqlPanePolicy = {
    /** Results and Tables are available by default unless explicitly hidden. */
    showResults?: boolean;
    showTables?: boolean;
    /** Crow's-foot/table relationship diagram. */
    showErd?: boolean;
    showCrowFoot?: boolean;
    showCrowfoot?: boolean;
    showCrowsFoot?: boolean;
    /** Chen ERD diagram. */
    showChen?: boolean;
    /** Preferred tab on the full desktop Tools surface. */
    defaultTab?: SqlPaneTab;
    /** Preferred tab on compact/stacked layouts. */
    compactDefaultTab?: SqlPaneTab;
};

/**
 * Presentation-only policy for the learner Tools workspace.
 *
 * The curriculum compiler resolves parent scopes into the topic bundle. The
 * topic bundle may then carry sparse lesson/card and exercise overrides.
 */
export type ToolPresentationPolicy = {
    /** Whether the Tools rail opens automatically for this scope. */
    defaultVisible?: boolean;
    /** Whether the learner may manually open Tools for this scope. */
    allowOpen?: boolean;
    /** Editor or Results outer workspace surface on desktop. */
    defaultSurface?: ToolSurface;
    /** Editor or Results outer workspace surface on compact layouts. */
    compactDefaultSurface?: ToolSurface;
    /** Output or interactive terminal inside the non-SQL Results surface. */
    runnerPane?: ToolRunnerPanePolicy;
    /** SQL-specific tabs inside the Results surface. */
    sqlPane?: ToolSqlPanePolicy;
};

function hasOwnKeys(value: object): boolean {
    return Object.keys(value).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Property-by-property inheritance. Missing child values inherit. */
export function mergeToolPresentationPolicies(
    ...values: Array<ToolPresentationPolicy | null | undefined>
): ToolPresentationPolicy | undefined {
    let merged: ToolPresentationPolicy = {};

    for (const value of values) {
        if (!isRecord(value)) continue;
        const incomingRunnerPane = isRecord(value.runnerPane)
            ? value.runnerPane
            : undefined;
        const runnerPane = {
            ...(merged.runnerPane ?? {}),
            ...(incomingRunnerPane ?? {}),
        } as ToolRunnerPanePolicy;
        const incomingSqlPane = isRecord(value.sqlPane)
            ? value.sqlPane
            : undefined;
        const sqlPane = {
            ...(merged.sqlPane ?? {}),
            ...(incomingSqlPane ?? {}),
        } as ToolSqlPanePolicy;
        merged = {
            ...merged,
            ...(value as ToolPresentationPolicy),
            ...(hasOwnKeys(runnerPane) ? { runnerPane } : {}),
            ...(hasOwnKeys(sqlPane) ? { sqlPane } : {}),
        };
    }

    return hasOwnKeys(merged) ? merged : undefined;
}

/** Merge sparse lesson/exercise override maps per key and per property. */
export function mergeToolPresentationOverrideMaps(
    ...maps: Array<Record<string, ToolPresentationPolicy> | null | undefined>
): Record<string, ToolPresentationPolicy> | undefined {
    const merged: Record<string, ToolPresentationPolicy> = {};

    for (const map of maps) {
        if (!map) continue;
        for (const [key, policy] of Object.entries(map)) {
            const next = mergeToolPresentationPolicies(merged[key], policy);
            if (next) merged[key] = next;
        }
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Resolve layout-specific values while preserving the authored policy. */
export function resolveToolPresentationForLayout(args: {
    policy?: ToolPresentationPolicy | null;
    compact: boolean;
}): ToolPresentationPolicy | undefined {
    const policy = args.policy;
    if (!policy) return undefined;

    const defaultSurface = args.compact
        ? policy.compactDefaultSurface ?? policy.defaultSurface
        : policy.defaultSurface;
    const runnerDefaultTab = args.compact
        ? policy.runnerPane?.compactDefaultTab ?? policy.runnerPane?.defaultTab
        : policy.runnerPane?.defaultTab;
    const sqlDefaultTab = args.compact
        ? policy.sqlPane?.compactDefaultTab ?? policy.sqlPane?.defaultTab
        : policy.sqlPane?.defaultTab;

    return mergeToolPresentationPolicies(policy, {
        ...(defaultSurface ? { defaultSurface } : {}),
        ...(runnerDefaultTab
            ? {
                runnerPane: {
                    defaultTab: runnerDefaultTab,
                },
            }
            : {}),
        ...(sqlDefaultTab
            ? {
                sqlPane: {
                    defaultTab: sqlDefaultTab,
                },
            }
            : {}),
    });
}

const TOOL_SURFACES = new Set<ToolSurface>(["editor", "results"]);
const RUNNER_PANE_TABS = new Set<RunnerPaneTab>(["output", "terminal"]);
const SQL_PANE_TABS = new Set<SqlPaneTab>([
    "results",
    "tables",
    "erd",
    "chen",
]);

const TOOL_POLICY_BOOLEAN_FIELDS = [
    "defaultVisible",
    "allowOpen",
] as const;

const SQL_PANE_BOOLEAN_FIELDS = [
    "showResults",
    "showTables",
    "showErd",
    "showCrowFoot",
    "showCrowfoot",
    "showCrowsFoot",
    "showChen",
] as const;

function optionalBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

function optionalToolSurface(value: unknown): ToolSurface | undefined {
    return TOOL_SURFACES.has(value as ToolSurface)
        ? (value as ToolSurface)
        : undefined;
}

function optionalRunnerPaneTab(value: unknown): RunnerPaneTab | undefined {
    return RUNNER_PANE_TABS.has(value as RunnerPaneTab)
        ? (value as RunnerPaneTab)
        : undefined;
}

function optionalSqlPaneTab(value: unknown): SqlPaneTab | undefined {
    return SQL_PANE_TABS.has(value as SqlPaneTab)
        ? (value as SqlPaneTab)
        : undefined;
}

/**
 * Convert unknown manifest input into the canonical shared Tools policy.
 * Invalid fields are omitted; authoring validation remains responsible for
 * reporting them before publication.
 */
export function normalizeToolPresentationPolicy(
    value: unknown,
): ToolPresentationPolicy | undefined {
    if (!isRecord(value)) return undefined;

    const normalized: ToolPresentationPolicy = {};

    for (const field of TOOL_POLICY_BOOLEAN_FIELDS) {
        const booleanValue = optionalBoolean(value[field]);
        if (booleanValue !== undefined) normalized[field] = booleanValue;
    }

    const defaultSurface = optionalToolSurface(value.defaultSurface);
    if (defaultSurface !== undefined) {
        normalized.defaultSurface = defaultSurface;
    }

    const compactDefaultSurface = optionalToolSurface(
        value.compactDefaultSurface,
    );
    if (compactDefaultSurface !== undefined) {
        normalized.compactDefaultSurface = compactDefaultSurface;
    }

    if (isRecord(value.runnerPane)) {
        const runnerPane: ToolRunnerPanePolicy = {};

        const defaultTab = optionalRunnerPaneTab(value.runnerPane.defaultTab);
        if (defaultTab !== undefined) runnerPane.defaultTab = defaultTab;

        const compactDefaultTab = optionalRunnerPaneTab(
            value.runnerPane.compactDefaultTab,
        );
        if (compactDefaultTab !== undefined) {
            runnerPane.compactDefaultTab = compactDefaultTab;
        }

        if (hasOwnKeys(runnerPane)) normalized.runnerPane = runnerPane;
    }

    if (isRecord(value.sqlPane)) {
        const sqlPane: ToolSqlPanePolicy = {};

        for (const field of SQL_PANE_BOOLEAN_FIELDS) {
            const booleanValue = optionalBoolean(value.sqlPane[field]);
            if (booleanValue !== undefined) sqlPane[field] = booleanValue;
        }

        const defaultTab = optionalSqlPaneTab(value.sqlPane.defaultTab);
        if (defaultTab !== undefined) sqlPane.defaultTab = defaultTab;

        const compactDefaultTab = optionalSqlPaneTab(
            value.sqlPane.compactDefaultTab,
        );
        if (compactDefaultTab !== undefined) {
            sqlPane.compactDefaultTab = compactDefaultTab;
        }

        if (hasOwnKeys(sqlPane)) normalized.sqlPane = sqlPane;
    }

    return hasOwnKeys(normalized) ? normalized : undefined;
}

/** Runtime-safe validation shared by authoring and compiler entry points. */
export function validateToolPresentationPolicy(
    value: unknown,
    path = "tools",
): string[] {
    if (value == null) return [];
    if (typeof value !== "object" || Array.isArray(value)) {
        return [`${path} must be an object`];
    }

    const issues: string[] = [];
    const policy = value as Record<string, unknown>;

    for (const field of TOOL_POLICY_BOOLEAN_FIELDS) {
        if (policy[field] != null && typeof policy[field] !== "boolean") {
            issues.push(`${path}.${field} must be a boolean when provided`);
        }
    }

    for (const field of [
        "defaultSurface",
        "compactDefaultSurface",
    ] as const) {
        const surface = policy[field];
        if (surface != null && !TOOL_SURFACES.has(surface as ToolSurface)) {
            issues.push(`${path}.${field} must be "editor" or "results"`);
        }
    }

    const runnerPane = policy.runnerPane;
    if (runnerPane != null) {
        if (typeof runnerPane !== "object" || Array.isArray(runnerPane)) {
            issues.push(`${path}.runnerPane must be an object when provided`);
        } else {
            const runner = runnerPane as Record<string, unknown>;
            for (const field of ["defaultTab", "compactDefaultTab"] as const) {
                const tab = runner[field];
                if (tab != null && !RUNNER_PANE_TABS.has(tab as RunnerPaneTab)) {
                    issues.push(
                        `${path}.runnerPane.${field} must be "output" or "terminal"`,
                    );
                }
            }
        }
    }

    const sqlPane = policy.sqlPane;
    if (sqlPane != null) {
        if (typeof sqlPane !== "object" || Array.isArray(sqlPane)) {
            issues.push(`${path}.sqlPane must be an object when provided`);
        } else {
            const sql = sqlPane as Record<string, unknown>;
            for (const field of SQL_PANE_BOOLEAN_FIELDS) {
                if (sql[field] != null && typeof sql[field] !== "boolean") {
                    issues.push(`${path}.sqlPane.${field} must be a boolean when provided`);
                }
            }

            for (const field of ["defaultTab", "compactDefaultTab"] as const) {
                const tab = sql[field];
                if (tab != null && !SQL_PANE_TABS.has(tab as SqlPaneTab)) {
                    issues.push(
                        `${path}.sqlPane.${field} must be "results", "tables", "erd", or "chen"`,
                    );
                }
            }

            const isHidden = (tab: unknown) => {
                if (tab === "results") return sql.showResults === false;
                if (tab === "tables") return sql.showTables === false;
                if (tab === "erd") {
                    return (
                        sql.showErd === false &&
                        sql.showCrowFoot !== true &&
                        sql.showCrowfoot !== true &&
                        sql.showCrowsFoot !== true
                    );
                }
                if (tab === "chen") return sql.showChen === false;
                return false;
            };

            for (const field of ["defaultTab", "compactDefaultTab"] as const) {
                if (isHidden(sql[field])) {
                    issues.push(
                        `${path}.sqlPane.${field} cannot select a tab hidden by the same policy`,
                    );
                }
            }
        }
    }

    return issues;
}
