import type {
    PseudocodeExpected,
    PseudocodeOperation,
    PseudocodeStructure,
    PseudocodeValidationFailure,
    PseudocodeValidationResult,
} from "./types.js";

type ParsedPseudocode = {
    normalized: string;
    lines: string[];
    structures: Map<PseudocodeStructure, number>;
    operations: Map<PseudocodeOperation, number[]>;
};

function stripComment(line: string) {
    const slash = line.indexOf("//");
    const hash = line.indexOf("#");
    const cut = [slash, hash].filter((index) => index >= 0).sort((a, b) => a - b)[0];
    return typeof cut === "number" ? line.slice(0, cut) : line;
}

export function normalizePseudocodeText(value: unknown): string {
    return String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/[←⟵]/g, "<-")
        .replace(/[≤]/g, "<=")
        .replace(/[≥]/g, ">=")
        .replace(/[≠]/g, "!=")
        .split("\n")
        .map((line) => stripComment(line).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
}

function increment<K>(map: Map<K, number>, key: K) {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function addOperation(
    map: Map<PseudocodeOperation, number[]>,
    operation: PseudocodeOperation,
    index: number,
) {
    const current = map.get(operation) ?? [];
    current.push(index);
    map.set(operation, current);
}

function parsePseudocode(value: unknown): ParsedPseudocode {
    const normalized = normalizePseudocodeText(value);
    const lines = normalized ? normalized.split("\n") : [];
    const structures = new Map<PseudocodeStructure, number>();
    const operations = new Map<PseudocodeOperation, number[]>();
    let procedureName = "";

    lines.forEach((rawLine, index) => {
        const line = rawLine.toUpperCase();
        const procedure = /^(?:PROCEDURE|FUNCTION|ALGORITHM)\s+([A-Z_][A-Z0-9_]*)/.exec(line);
        if (procedure) {
            procedureName = procedure[1] ?? "";
            increment(structures, "procedure");
        }
        if (/^ELSE\s+IF\b/.test(line)) increment(structures, "else_if");
        else if (/^IF\b/.test(line)) increment(structures, "if");
        else if (/^ELSE\b/.test(line)) increment(structures, "else");
        if (/^WHILE\b/.test(line)) {
            increment(structures, "while");
            addOperation(operations, "loop", index);
        }
        if (/^FOR(?:\s+EACH)?\b/.test(line)) {
            increment(structures, "for");
            addOperation(operations, "loop", index);
        }
        if (/^RETURN\b/.test(line)) increment(structures, "return");
        if (/^BREAK\b/.test(line)) increment(structures, "break");
        if (/^CONTINUE\b/.test(line)) increment(structures, "continue");
        if (/\b(?:CREATE|NEW)\b/.test(line)) increment(structures, "create");
        if (/\bSWAP\b/.test(line)) increment(structures, "swap");
        if (/<-|^SET\b/.test(line)) increment(structures, "assignment");
        if (/\b[A-Z_][A-Z0-9_]*\s*\(/.test(line)) increment(structures, "call");

        if (/(?:==|(?<![<>!])=(?!=)|\bEQUALS?\b|\bIS EQUAL TO\b)/.test(line) && /^(?:IF|ELSE IF|WHILE)\b/.test(line)) {
            addOperation(operations, "compare_equal", index);
        }
        if (/(?:<|SMALLER THAN|LESS THAN)/.test(line) && /^(?:IF|ELSE IF|WHILE)\b/.test(line)) {
            addOperation(operations, "compare_less", index);
        }
        if (/(?:>|GREATER THAN|LARGER THAN)/.test(line) && /^(?:IF|ELSE IF|WHILE)\b/.test(line)) {
            addOperation(operations, "compare_greater", index);
        }
        const assignsLeftMember = /\.LEFT\s*(?:<-|=(?!=))/.test(line);
        const assignsRightMember = /\.RIGHT\s*(?:<-|=(?!=))/.test(line);
        if (assignsLeftMember) addOperation(operations, "link_left", index);
        else if (/(?:<-|SET\b).*?(?:\.LEFT\b|LEFT CHILD\b)/.test(line)) {
            addOperation(operations, "move_left", index);
        }
        if (assignsRightMember) addOperation(operations, "link_right", index);
        else if (/(?:<-|SET\b).*?(?:\.RIGHT\b|RIGHT CHILD\b)/.test(line)) {
            addOperation(operations, "move_right", index);
        }
        if (/^RETURN\s+(?:NULL|NIL|NONE)\b/.test(line)) addOperation(operations, "return_null", index);
        else if (/^RETURN\b/.test(line)) addOperation(operations, "return_value", index);
        if (/\b(?:CREATE_NODE|NEW NODE|CREATE NODE)\b/.test(line)) addOperation(operations, "create_node", index);
        if (procedureName && new RegExp(`\\b${procedureName}\\s*\\(`).test(line) && !procedure) {
            addOperation(operations, "recursive_call", index);
        }
        if (/\bSWAP\b/.test(line)) addOperation(operations, "swap", index);
        if (/\bENQUEUE\b/.test(line)) addOperation(operations, "enqueue", index);
        if (/\bDEQUEUE\b/.test(line)) addOperation(operations, "dequeue", index);
        if (/\bPUSH\b/.test(line)) addOperation(operations, "push", index);
        if (/\bPOP\b/.test(line)) addOperation(operations, "pop", index);
        if (/\bVISIT\b/.test(line)) addOperation(operations, "visit", index);
        if (/\+\+|\bINCREMENT\b|<-\s*[^\n]+\+\s*1\b/.test(line)) addOperation(operations, "increment", index);
        if (/--|\bDECREMENT\b|<-\s*[^\n]+-\s*1\b/.test(line)) addOperation(operations, "decrement", index);
        if (/\bMID(?:POINT)?\b.*(?:LOW|LEFT).*(?:HIGH|RIGHT)|(?:LOW|LEFT).*(?:HIGH|RIGHT).*\/\s*2/.test(line)) {
            addOperation(operations, "midpoint", index);
        }
    });

    return { normalized, lines, structures, operations };
}

function countMatches(text: string, pattern: string, flags = "i") {
    try {
        const normalizedFlags = flags.includes("g") ? flags : `${flags}g`;
        return [...text.matchAll(new RegExp(pattern, normalizedFlags))].length;
    } catch {
        return 0;
    }
}

function normalizeTraceTokens(value: string): string[] {
    return value
        .replace(/[→⟶]/g, "->")
        .split(/(?:->|\n|,)/)
        .map((part) => part.trim().replace(/\s+/g, " ").toUpperCase())
        .filter(Boolean);
}

function containsOrdered(haystack: string[], needle: string[]) {
    let cursor = 0;
    for (const value of haystack) {
        if (value === needle[cursor]) cursor += 1;
        if (cursor === needle.length) return true;
    }
    return needle.length === 0;
}

export function validatePseudocodeSubmission(args: {
    answer: unknown;
    expected: PseudocodeExpected;
}): PseudocodeValidationResult {
    const parsed = parsePseudocode(args.answer);
    const failures: PseudocodeValidationFailure[] = [];
    const passedRuleIds: string[] = [];

    if (!parsed.normalized) {
        return {
            ok: false,
            normalized: "",
            passedRuleIds: [],
            failures: [{ id: "answer-required", message: "Enter pseudocode before checking your answer." }],
        };
    }

    for (const rule of args.expected.rules ?? []) {
        let passed = false;
        if (rule.kind === "structure") {
            const count = parsed.structures.get(rule.structure) ?? 0;
            passed = count >= (rule.min ?? 1) && (rule.max === undefined || count <= rule.max);
        } else if (rule.kind === "operation") {
            const count = parsed.operations.get(rule.operation)?.length ?? 0;
            passed = count >= (rule.min ?? 1) && (rule.max === undefined || count <= rule.max);
        } else if (rule.kind === "pattern") {
            passed = countMatches(parsed.normalized, rule.pattern, rule.flags) >= (rule.min ?? 1);
        } else if (rule.kind === "forbidden_pattern") {
            passed = countMatches(parsed.normalized, rule.pattern, rule.flags) === 0;
        } else if (rule.kind === "ordered_operations") {
            let last = -1;
            passed = rule.operations.every((operation) => {
                const next = (parsed.operations.get(operation) ?? []).find((index) => index > last);
                if (next === undefined) return false;
                last = next;
                return true;
            });
        }

        if (passed) passedRuleIds.push(rule.id);
        else {
            failures.push({
                id: rule.id,
                message:
                    rule.message ??
                    (rule.kind === "structure"
                        ? `Include the required ${rule.structure.replace(/_/g, " ")} structure.`
                        : rule.kind === "operation"
                            ? `Include the required ${rule.operation.replace(/_/g, " ")} operation.`
                            : "The pseudocode does not satisfy this required rule."),
            });
        }
    }

    if (args.expected.mode === "trace" && args.expected.scenarios?.length) {
        const actual = normalizeTraceTokens(parsed.normalized);
        for (const scenario of args.expected.scenarios) {
            const expected = scenario.expectedLines.map((line) => line.trim().toUpperCase());
            const passed = scenario.match === "contains"
                ? containsOrdered(actual, expected)
                : actual.length === expected.length && actual.every((value, index) => value === expected[index]);
            if (passed) passedRuleIds.push(scenario.id);
            else {
                failures.push({
                    id: scenario.id,
                    message: scenario.message ?? "The trace does not follow the expected execution path.",
                });
            }
        }
    }

    return {
        ok: failures.length === 0,
        normalized: parsed.normalized,
        passedRuleIds,
        failures,
    };
}
