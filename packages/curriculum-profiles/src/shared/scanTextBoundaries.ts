export type TextBoundaryRule = {
    code: string;
    pattern: RegExp;
    severity: "warn" | "error";
    message: string;
};

export type TextBoundarySource = {
    field: string;
    text: string | null | undefined;
    exerciseId?: string;
};

export type TextBoundaryMatch = {
    code: string;
    severity: "warn" | "error";
    message: string;
    field: string;
    exerciseId?: string;
};

export function scanTextBoundaries(args: {
    rules: TextBoundaryRule[];
    sources: TextBoundarySource[];
}): TextBoundaryMatch[] {
    const matches: TextBoundaryMatch[] = [];

    for (const source of args.sources) {
        const text = String(source.text ?? "").trim();
        if (!text) continue;

        for (const rule of args.rules) {
            rule.pattern.lastIndex = 0;
            if (!rule.pattern.test(text)) continue;

            matches.push({
                code: rule.code,
                severity: rule.severity,
                message: rule.message,
                field: source.field,
                exerciseId: source.exerciseId,
            });
        }
    }

    return matches;
}
