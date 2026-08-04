import { describe, expect, it } from "vitest";

import { isFinalPtySessionState } from "./usePtyRunner";

describe("isFinalPtySessionState", () => {
    it("recognizes every backend terminal state that must release the Run button", () => {
        expect(isFinalPtySessionState("completed")).toBe(true);
        expect(isFinalPtySessionState("failed")).toBe(true);
        expect(isFinalPtySessionState("canceled")).toBe(true);
        expect(isFinalPtySessionState("timed_out")).toBe(true);
    });

    it("does not finalize active or input-waiting sessions", () => {
        expect(isFinalPtySessionState("queued")).toBe(false);
        expect(isFinalPtySessionState("preparing")).toBe(false);
        expect(isFinalPtySessionState("running")).toBe(false);
        expect(isFinalPtySessionState("waiting_for_input")).toBe(false);
    });
});
