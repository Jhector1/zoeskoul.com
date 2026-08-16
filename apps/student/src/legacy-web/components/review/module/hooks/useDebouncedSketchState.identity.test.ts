import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    new URL("./useDebouncedSketchState.ts", import.meta.url),
    "utf8",
);
const compactSource = source.replace(/\s+/g, " ");

describe("useDebouncedSketchState API identity", () => {
    it("keeps the returned sketch API memoized from stable callback members", () => {
        expect(source).toMatch(
            /import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*"react";/s,
        );
        expect(compactSource).toContain(
            "const flushAll = useCallback(",
        );
        expect(compactSource).toContain(
            "const saveSketchDebounced = useCallback(",
        );
        expect(compactSource).toContain(
            "const api = useMemo( () => ({ saveSketchDebounced, flushAll }), [saveSketchDebounced, flushAll], ); return api;",
        );
        expect(compactSource).not.toContain(
            "return { saveSketchDebounced, flushAll };",
        );
    });
});
