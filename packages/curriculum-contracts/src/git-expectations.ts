import { normalizeWorkspacePath } from "./workspace-path.js";

export type GitCommitMessageExpectation = {
    /** 0 is HEAD, 1 is HEAD^, and so on. */
    position?: number;
    /** POSIX extended regular expression matched against the commit subject. */
    matches: string;
    message?: string;
};

export type GitHeadFileExpectation = {
    path: string;
    contains?: string;
    equals?: string;
    message?: string;
};

export type GitRemoteExpectation = {
    name: string;
    urlContains?: string;
    requiredBranches?: string[];
    message?: string;
};

export type GitExpectations = {
    /** Workspace-relative repository folder. Omit to use the workspace root. */
    repositoryPath?: string;
    repositoryInitialized?: boolean;
    currentBranch?: string;
    cleanWorkingTree?: boolean;
    minimumCommitCount?: number;
    exactCommitCount?: number;
    trackedFiles?: string[];
    untrackedFiles?: string[];
    ignoredFiles?: string[];
    forbiddenTrackedFiles?: string[];
    requiredBranches?: string[];
    forbiddenBranches?: string[];
    commitMessages?: GitCommitMessageExpectation[];
    headFiles?: GitHeadFileExpectation[];
    remotes?: GitRemoteExpectation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value: unknown, label: string): string {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    if (text.includes("\0") || /[\r\n]/.test(text)) {
        throw new Error(`${label} must not contain null bytes or newlines.`);
    }
    return text;
}

function optionalText(value: unknown, label: string): string | undefined {
    if (typeof value === "undefined") return undefined;
    return nonEmptyText(value, label);
}

function optionalStringAllowEmpty(
    value: unknown,
    label: string,
): string | undefined {
    if (typeof value === "undefined") return undefined;
    if (typeof value !== "string") {
        throw new Error(`${label} must be a string when provided.`);
    }
    if (value.includes("\0")) {
        throw new Error(`${label} must not contain null bytes.`);
    }
    return value.replace(/\r\n?/g, "\n");
}

function booleanValue(value: unknown, label: string): boolean | undefined {
    if (typeof value === "undefined") return undefined;
    if (typeof value !== "boolean") {
        throw new Error(`${label} must be a boolean when provided.`);
    }
    return value;
}

function nonNegativeInteger(
    value: unknown,
    label: string,
): number | undefined {
    if (typeof value === "undefined") return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative integer when provided.`);
    }
    return value;
}

function stringList(
    value: unknown,
    label: string,
    options: { workspacePaths?: boolean } = {},
): string[] | undefined {
    if (typeof value === "undefined") return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array when provided.`);
    }

    const normalized = value.map((entry, index) => {
        const text = nonEmptyText(entry, `${label}[${index}]`);
        return options.workspacePaths ? normalizeWorkspacePath(text) : text;
    });

    const unique = [...new Set(normalized)];
    return unique.length ? unique : undefined;
}

function assertOnlyKeys(
    value: Record<string, unknown>,
    allowedKeys: readonly string[],
    label: string,
) {
    const allowed = new Set(allowedKeys);
    const extras = Object.keys(value).filter((key) => !allowed.has(key));
    if (extras.length > 0) {
        throw new Error(`${label} has unknown field(s): ${extras.join(", ")}.`);
    }
}

function normalizeCommitMessages(
    value: unknown,
    label: string,
): GitCommitMessageExpectation[] | undefined {
    if (typeof value === "undefined") return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array when provided.`);
    }

    const normalized = value.map((entry, index) => {
        const itemLabel = `${label}[${index}]`;
        if (!isRecord(entry)) {
            throw new Error(`${itemLabel} must be an object.`);
        }
        assertOnlyKeys(entry, ["position", "matches", "message"], itemLabel);

        const position = nonNegativeInteger(
            entry.position,
            `${itemLabel}.position`,
        );
        const matches = nonEmptyText(entry.matches, `${itemLabel}.matches`);
        const message = optionalText(entry.message, `${itemLabel}.message`);

        return {
            ...(typeof position === "number" ? { position } : {}),
            matches,
            ...(message ? { message } : {}),
        };
    });

    return normalized.length ? normalized : undefined;
}

function normalizeHeadFiles(
    value: unknown,
    label: string,
): GitHeadFileExpectation[] | undefined {
    if (typeof value === "undefined") return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array when provided.`);
    }

    const normalized = value.map((entry, index) => {
        const itemLabel = `${label}[${index}]`;
        if (!isRecord(entry)) {
            throw new Error(`${itemLabel} must be an object.`);
        }
        assertOnlyKeys(
            entry,
            ["path", "contains", "equals", "message"],
            itemLabel,
        );

        const path = normalizeWorkspacePath(
            nonEmptyText(entry.path, `${itemLabel}.path`),
        );
        const contains = optionalText(
            entry.contains,
            `${itemLabel}.contains`,
        );
        const equals = optionalStringAllowEmpty(
            entry.equals,
            `${itemLabel}.equals`,
        );
        const message = optionalText(entry.message, `${itemLabel}.message`);

        if (typeof contains === "undefined" && typeof equals === "undefined") {
            throw new Error(
                `${itemLabel} must include contains or equals.`,
            );
        }
        if (typeof contains !== "undefined" && typeof equals !== "undefined") {
            throw new Error(
                `${itemLabel} must use contains or equals, not both.`,
            );
        }

        return {
            path,
            ...(contains ? { contains } : {}),
            ...(typeof equals === "string" ? { equals } : {}),
            ...(message ? { message } : {}),
        };
    });

    return normalized.length ? normalized : undefined;
}

function normalizeRemotes(
    value: unknown,
    label: string,
): GitRemoteExpectation[] | undefined {
    if (typeof value === "undefined") return undefined;
    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array when provided.`);
    }

    const normalized = value.map((entry, index) => {
        const itemLabel = `${label}[${index}]`;
        if (!isRecord(entry)) {
            throw new Error(`${itemLabel} must be an object.`);
        }
        assertOnlyKeys(
            entry,
            ["name", "urlContains", "requiredBranches", "message"],
            itemLabel,
        );

        const name = nonEmptyText(entry.name, `${itemLabel}.name`);
        const urlContains = optionalText(
            entry.urlContains,
            `${itemLabel}.urlContains`,
        );
        const requiredBranches = stringList(
            entry.requiredBranches,
            `${itemLabel}.requiredBranches`,
        );
        const message = optionalText(entry.message, `${itemLabel}.message`);

        return {
            name,
            ...(urlContains ? { urlContains } : {}),
            ...(requiredBranches?.length ? { requiredBranches } : {}),
            ...(message ? { message } : {}),
        };
    });

    return normalized.length ? normalized : undefined;
}

export function normalizeGitExpectations(
    value: unknown,
    label = "gitExpectations",
): GitExpectations | undefined {
    if (typeof value === "undefined") return undefined;
    if (!isRecord(value)) {
        throw new Error(`${label} must be an object.`);
    }

    assertOnlyKeys(
        value,
        [
            "repositoryPath",
            "repositoryInitialized",
            "currentBranch",
            "cleanWorkingTree",
            "minimumCommitCount",
            "exactCommitCount",
            "trackedFiles",
            "untrackedFiles",
            "ignoredFiles",
            "forbiddenTrackedFiles",
            "requiredBranches",
            "forbiddenBranches",
            "commitMessages",
            "headFiles",
            "remotes",
        ],
        label,
    );

    const repositoryPath =
        typeof value.repositoryPath === "undefined"
            ? undefined
            : normalizeWorkspacePath(
                nonEmptyText(value.repositoryPath, `${label}.repositoryPath`),
            );
    const repositoryInitialized = booleanValue(
        value.repositoryInitialized,
        `${label}.repositoryInitialized`,
    );
    const currentBranch = optionalText(
        value.currentBranch,
        `${label}.currentBranch`,
    );
    const cleanWorkingTree = booleanValue(
        value.cleanWorkingTree,
        `${label}.cleanWorkingTree`,
    );
    const minimumCommitCount = nonNegativeInteger(
        value.minimumCommitCount,
        `${label}.minimumCommitCount`,
    );
    const exactCommitCount = nonNegativeInteger(
        value.exactCommitCount,
        `${label}.exactCommitCount`,
    );
    const trackedFiles = stringList(
        value.trackedFiles,
        `${label}.trackedFiles`,
        { workspacePaths: true },
    );
    const untrackedFiles = stringList(
        value.untrackedFiles,
        `${label}.untrackedFiles`,
        { workspacePaths: true },
    );
    const ignoredFiles = stringList(
        value.ignoredFiles,
        `${label}.ignoredFiles`,
        { workspacePaths: true },
    );
    const forbiddenTrackedFiles = stringList(
        value.forbiddenTrackedFiles,
        `${label}.forbiddenTrackedFiles`,
        { workspacePaths: true },
    );
    const requiredBranches = stringList(
        value.requiredBranches,
        `${label}.requiredBranches`,
    );
    const forbiddenBranches = stringList(
        value.forbiddenBranches,
        `${label}.forbiddenBranches`,
    );
    const commitMessages = normalizeCommitMessages(
        value.commitMessages,
        `${label}.commitMessages`,
    );
    const headFiles = normalizeHeadFiles(
        value.headFiles,
        `${label}.headFiles`,
    );
    const remotes = normalizeRemotes(value.remotes, `${label}.remotes`);

    const result: GitExpectations = {
        ...(repositoryPath ? { repositoryPath } : {}),
        ...(typeof repositoryInitialized === "boolean"
            ? { repositoryInitialized }
            : {}),
        ...(currentBranch ? { currentBranch } : {}),
        ...(typeof cleanWorkingTree === "boolean"
            ? { cleanWorkingTree }
            : {}),
        ...(typeof minimumCommitCount === "number"
            ? { minimumCommitCount }
            : {}),
        ...(typeof exactCommitCount === "number" ? { exactCommitCount } : {}),
        ...(trackedFiles?.length ? { trackedFiles } : {}),
        ...(untrackedFiles?.length ? { untrackedFiles } : {}),
        ...(ignoredFiles?.length ? { ignoredFiles } : {}),
        ...(forbiddenTrackedFiles?.length ? { forbiddenTrackedFiles } : {}),
        ...(requiredBranches?.length ? { requiredBranches } : {}),
        ...(forbiddenBranches?.length ? { forbiddenBranches } : {}),
        ...(commitMessages?.length ? { commitMessages } : {}),
        ...(headFiles?.length ? { headFiles } : {}),
        ...(remotes?.length ? { remotes } : {}),
    };

    const assertionKeys = Object.keys(result).filter(
        (key) => key !== "repositoryPath",
    );
    if (assertionKeys.length === 0) {
        throw new Error(
            `${label} must include at least one repository-state assertion.`,
        );
    }

    if (repositoryInitialized === false && assertionKeys.length > 1) {
        throw new Error(
            `${label}.repositoryInitialized cannot be false when other repository assertions are present.`,
        );
    }

    if (
        typeof minimumCommitCount === "number" &&
        typeof exactCommitCount === "number" &&
        exactCommitCount < minimumCommitCount
    ) {
        throw new Error(
            `${label}.exactCommitCount cannot be smaller than minimumCommitCount.`,
        );
    }

    const contradictoryTrackedFiles = (trackedFiles ?? []).filter((path) =>
        (forbiddenTrackedFiles ?? []).includes(path),
    );
    if (contradictoryTrackedFiles.length > 0) {
        throw new Error(
            `${label} cannot require and forbid the same tracked file: ${contradictoryTrackedFiles.join(", ")}.`,
        );
    }

    const contradictoryBranches = (requiredBranches ?? []).filter((branch) =>
        (forbiddenBranches ?? []).includes(branch),
    );
    if (contradictoryBranches.length > 0) {
        throw new Error(
            `${label} cannot require and forbid the same branch: ${contradictoryBranches.join(", ")}.`,
        );
    }

    if (
        exactCommitCount === 0 &&
        ((commitMessages?.length ?? 0) > 0 || (headFiles?.length ?? 0) > 0)
    ) {
        throw new Error(
            `${label}.exactCommitCount cannot be 0 when commitMessages or headFiles are required.`,
        );
    }

    return result;
}
