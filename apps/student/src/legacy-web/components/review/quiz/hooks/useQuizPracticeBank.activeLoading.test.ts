import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    resolve(process.cwd(), "src/legacy-web/components/review/quiz/hooks/useQuizPracticeBank.ts"),
    "utf8",
);

describe("useQuizPracticeBank active loading ownership", () => {
    it("owns one in-flight load per stable authored exercise identity", () => {
        expect(source).toContain(
            "const inFlightLoadRef = useRef<Record<string, string>>({});",
        );
        expect(source).toContain(
            "if (!force && inFlightLoadRef.current[stableKey] != null)",
        );
        expect(source).toContain(
            "const requestMarker = `${cycle}:${token}`;",
        );
        expect(source).toContain(
            "inFlightLoadRef.current[stableKey] = requestMarker;",
        );
        expect(source).toContain(
            "if (inFlightLoadRef.current[stableKey] === requestMarker)",
        );
        expect(source).toContain(
            "delete inFlightLoadRef.current[stableKey];",
        );
    });

    it("does not let effect cleanup cancel a request that already started", () => {
        expect(source).not.toContain("cancelledRef?.current");
        expect(source).not.toContain("{ cancelledRef }");
        expect(source).toContain(
            "const prefetchCancelledRef = { current: false };",
        );
        expect(source).toContain(
            "prefetchCancelledRef.current = true;",
        );
        expect(source).toContain("void loadPracticeQuestion(q);");
    });

    it("accepts an identity-matched signed response even if only the runtime generation advanced", () => {
        const loadStart = source.indexOf(
            "const loadPracticeQuestion = useCallback(",
        );
        const loadEnd = source.indexOf(
            "\n  useEffect(() => {",
            loadStart,
        );
        const loadSource = source.slice(loadStart, loadEnd);

        expect(loadSource).toContain(
            "if (loadCycleRef.current !== cycle) return;",
        );
        expect(loadSource).toContain(
            "if (loadTokenRef.current[stableKey] !== token) return;",
        );
        expect(loadSource).toContain(
            "resolvedPracticeExerciseMatchesRequestedKey(",
        );
        expect(loadSource).not.toContain(
            "if (useReviewRuntimeStore.getState().resetRevision !== startedGeneration) return;",
        );
        expect(loadSource).toContain(
            "runtimeGeneration: startedGeneration,",
        );
    });
});
