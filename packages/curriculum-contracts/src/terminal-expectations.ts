import type {
    HiddenShellCheck,
    TerminalExpectations,
} from "@zoeskoul/practice-checks";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeTerminalCommandExpectations(
    value: unknown,
    label: string,
): TerminalExpectations["requiredCommands"] | undefined {
    if (typeof value === "undefined") return undefined;

    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array.`);
    }

    const normalized = value.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error(`${label}[${index}] must be an object.`);
        }

        const record = entry as Record<string, unknown>;
        const supportedKeys = new Set(["pattern", "message"]);
        const unsupportedKeys = Object.keys(record).filter(
            (key) => !supportedKeys.has(key),
        );

        if (unsupportedKeys.length > 0) {
            throw new Error(
                `${label}[${index}] has unknown field(s): ${unsupportedKeys.join(", ")}.`,
            );
        }

        const pattern = normalizeText(record.pattern);
        if (!pattern) {
            throw new Error(`${label}[${index}].pattern must be non-empty.`);
        }

        const message = normalizeText(record.message);

        return {
            pattern,
            ...(message ? { message } : {}),
        };
    });

    return normalized.length ? normalized : undefined;
}

function normalizeTerminalStringList(
    value: unknown,
    label: string,
): string[] | undefined {
    if (typeof value === "undefined") return undefined;

    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array.`);
    }

    const normalized = value.map((entry, index) => {
        const text = normalizeText(entry);
        if (!text) {
            throw new Error(`${label}[${index}] must be a non-empty string.`);
        }
        return text;
    });

    return normalized.length ? normalized : undefined;
}

export function normalizeTerminalExpectations(
    value: unknown,
    label = "terminalExpectations",
): TerminalExpectations | undefined {
    if (typeof value === "undefined") return undefined;

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label}: expected an object.`);
    }

    const record = value as Record<string, unknown>;
    const supportedKeys = new Set([
        "requiredCommands",
        "forbiddenCommands",
        "outputContains",
        "outputRegex",
        "cwdContains",
        "cwdEndsWith",
    ]);
    const unsupportedKeys = Object.keys(record).filter(
        (key) => !supportedKeys.has(key),
    );

    if (unsupportedKeys.length > 0) {
        throw new Error(
            `${label}: unsupported key "${unsupportedKeys[0]}".`,
        );
    }

    const requiredCommands = normalizeTerminalCommandExpectations(
        record.requiredCommands,
        `${label}: requiredCommands`,
    );
    const forbiddenCommands = normalizeTerminalCommandExpectations(
        record.forbiddenCommands,
        `${label}: forbiddenCommands`,
    );
    const outputContains = normalizeTerminalStringList(
        record.outputContains,
        `${label}: outputContains`,
    );
    const outputRegex = normalizeTerminalStringList(
        record.outputRegex,
        `${label}: outputRegex`,
    );
    const cwdContains = normalizeText(record.cwdContains);
    const cwdEndsWith = normalizeText(record.cwdEndsWith);

    const result: TerminalExpectations = {
        ...(requiredCommands?.length ? { requiredCommands } : {}),
        ...(forbiddenCommands?.length ? { forbiddenCommands } : {}),
        ...(outputContains?.length ? { outputContains } : {}),
        ...(outputRegex?.length ? { outputRegex } : {}),
        ...(cwdContains ? { cwdContains } : {}),
        ...(cwdEndsWith ? { cwdEndsWith } : {}),
    };

    return Object.keys(result).length ? result : undefined;
}

export function normalizeHiddenShellCheck(
    value: unknown,
    label = "hiddenShellCheck",
): HiddenShellCheck | undefined {
    if (typeof value === "undefined") return undefined;

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label}: expected an object.`);
    }

    const record = value as Record<string, unknown>;
    const supportedKeys = new Set(["script", "timeoutMs"]);
    const unsupportedKeys = Object.keys(record).filter(
        (key) => !supportedKeys.has(key),
    );

    if (unsupportedKeys.length > 0) {
        throw new Error(
            `${label}: unsupported key "${unsupportedKeys[0]}".`,
        );
    }

    const script = normalizeText(record.script);
    if (!script) {
        throw new Error(`${label}: script must be non-empty.`);
    }

    if (
        typeof record.timeoutMs !== "undefined" &&
        (typeof record.timeoutMs !== "number" ||
            !Number.isInteger(record.timeoutMs) ||
            record.timeoutMs < 1)
    ) {
        throw new Error(
            `${label}: timeoutMs must be a positive integer when provided.`,
        );
    }

    return {
        script,
        ...(typeof record.timeoutMs === "number"
            ? { timeoutMs: record.timeoutMs }
            : {}),
    };
}
