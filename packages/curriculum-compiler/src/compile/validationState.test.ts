import { describe, expect, it } from "vitest";
import {
    assertValidationBypassAllowed,
    buildUnsafeValidationWarning,
    resolveCompileValidationState,
} from "./validationState.js";

describe("compile validation state", () => {
    it("keeps every validation layer enabled by default", () => {
        expect(resolveCompileValidationState()).toMatchObject({
            unsafeSkipValidation: false,
            structural: { ran: true, skipped: false, required: true },
            qualityGates: { ran: true, skipped: false, required: true },
            semantic: { ran: true, skipped: false, required: true },
            golden: { ran: true, skipped: false, required: true },
        });
    });

    it("skips only the requested downstream layer", () => {
        expect(
            resolveCompileValidationState({ skipGolden: true }),
        ).toMatchObject({
            structural: { ran: true, skipped: false },
            qualityGates: { ran: true, skipped: false },
            semantic: { ran: true, skipped: false },
            golden: { ran: false, skipped: true },
        });
    });

    it("makes unsafe skip imply all downstream skip flags but not structural validation", () => {
        expect(
            resolveCompileValidationState({ unsafeSkipValidation: true }),
        ).toMatchObject({
            unsafeSkipValidation: true,
            structural: { ran: true, skipped: false, required: true },
            qualityGates: { ran: false, skipped: true, required: false },
            semantic: { ran: false, skipped: true, required: false },
            golden: { ran: false, skipped: true, required: false },
        });
    });

    it("rejects validation bypass without draft-only output", () => {
        expect(() =>
            assertValidationBypassAllowed({
                validation: { unsafeSkipValidation: true },
                draftOnly: false,
                publishToLive: false,
            }),
        ).toThrow(/require --draft-only/);
    });

    it("rejects validation bypass for publish flows", () => {
        expect(() =>
            assertValidationBypassAllowed({
                validation: { skipGolden: true },
                draftOnly: true,
                publishToLive: true,
            }),
        ).toThrow(/not allowed for publish flows/);
    });

    it("allows validation bypass for draft-only non-publish output", () => {
        expect(() =>
            assertValidationBypassAllowed({
                validation: { skipSemantic: true },
                draftOnly: true,
                publishToLive: false,
            }),
        ).not.toThrow();
    });

    it("builds a loud warning for unsafe mode", () => {
        expect(
            buildUnsafeValidationWarning(
                resolveCompileValidationState({ unsafeSkipValidation: true }),
            ),
        ).toMatch(/UNSAFE VALIDATION BYPASS ENABLED/);
    });
});
