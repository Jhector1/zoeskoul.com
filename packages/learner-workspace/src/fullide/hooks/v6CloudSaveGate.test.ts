import { describe, expect, it } from "vitest";
import { createCloudSaveGate } from "./v6CloudSaveGate";

describe("cloud save single-flight gate", () => {
    it("rejects a second save before the first finishes", () => {
        const gate = createCloudSaveGate();
        expect(gate.begin()).toBe(true);
        expect(gate.busy).toBe(true);
        expect(gate.begin()).toBe(false);
    });

    it("allows a retry after a failed request releases the gate", () => {
        const gate = createCloudSaveGate();
        expect(gate.begin()).toBe(true);
        gate.end();
        expect(gate.busy).toBe(false);
        expect(gate.begin()).toBe(true);
        gate.end();
    });

    it("isolates different IDE mounts", () => {
        const a = createCloudSaveGate();
        const b = createCloudSaveGate();
        expect(a.begin()).toBe(true);
        expect(b.begin()).toBe(true);
        a.end();b.end();
    });
});
