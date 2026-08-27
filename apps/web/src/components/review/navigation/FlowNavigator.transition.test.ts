import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    resolve(process.cwd(), "src/components/review/navigation/FlowNavigator.tsx"),
    "utf8",
);

describe("FlowNavigator transition ownership", () => {
    it("mounts the next keyed card without waiting for the previous exit", () => {
        expect(source).toContain('mode="popLayout"');
        expect(source).not.toContain('mode="wait"');
    });

    it("preserves authored-item keyed identity", () => {
        expect(source).toContain("key={getKey(current, safeIndex)}");
    });

    it("preserves the existing motion contract", () => {
        expect(source).toContain("animate={{ opacity: 1, x: 0, scale: 1 }}");
        expect(source).toContain("exit={");
    });
});
