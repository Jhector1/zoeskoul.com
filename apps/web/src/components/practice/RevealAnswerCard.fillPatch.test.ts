import { describe, expect, it, vi } from "vitest";

import {
    applyRevealFillAnswer,
    buildRevealFillPatches,
} from "./RevealAnswerCard";

describe("buildRevealFillPatches", () => {
    it("builds a user-authored tools patch for code_input Fill answer", () => {
        const { itemPatch, toolsPatch } = buildRevealFillPatches({
            isCodeInput: true,
            fillPatch: {
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
            } as any,
        });

        expect(itemPatch).toMatchObject({
            code: "print('solution')",
            codeLang: "python",
            codeStdin: "input value",
            codeTouched: true,
            submitted: false,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: true,
            updateOrigin: "user",
        });

        expect(toolsPatch).toMatchObject({
            code: "print('solution')",
            codeLang: "python",
            codeStdin: "input value",
            codeTouched: true,
            submitted: false,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: true,
            updateOrigin: "user",
            userEdited: true,
            preferSnapshot: true,
            workspaceOrigin: "user",
        });
    });

    it("does not add code editor metadata for non-code Fill answer", () => {
        const { itemPatch, toolsPatch } = buildRevealFillPatches({
            isCodeInput: false,
            fillPatch: {
                shortText: "Paris",
            } as any,
        });

        expect(itemPatch).toMatchObject({
            shortText: "Paris",
            submitted: false,
            feedbackDismissed: true,
            dismissFeedbackOnEdit: true,
            updateOrigin: "user",
        });

        expect(itemPatch).not.toHaveProperty("codeTouched");
        expect(toolsPatch).not.toHaveProperty("userEdited");
        expect(toolsPatch).not.toHaveProperty("preferSnapshot");
        expect(toolsPatch).not.toHaveProperty("workspaceOrigin");
    });

    it("applies code_input Fill answer to both item state and registered CodeToolPane input", () => {
        const updateCurrent = vi.fn();
        const patchCodeInput = vi.fn();

        applyRevealFillAnswer({
            isCodeInput: true,
            codeInputId: "code-input-1",
            updateCurrent,
            patchCodeInput,
            fillPatch: {
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
            } as any,
        });

        expect(updateCurrent).toHaveBeenCalledWith(
            expect.objectContaining({
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
                codeTouched: true,
                submitted: false,
                feedbackDismissed: true,
                dismissFeedbackOnEdit: true,
                updateOrigin: "user",
            }),
        );

        expect(patchCodeInput).toHaveBeenCalledWith(
            "code-input-1",
            expect.objectContaining({
                code: "print('solution')",
                codeLang: "python",
                codeStdin: "input value",
                codeTouched: true,
                submitted: false,
                feedbackDismissed: true,
                dismissFeedbackOnEdit: true,
                updateOrigin: "user",
                userEdited: true,
                preferSnapshot: true,
                workspaceOrigin: "user",
            }),
        );
    });

    it("does not patch CodeToolPane when codeInputId is missing", () => {
        const updateCurrent = vi.fn();
        const patchCodeInput = vi.fn();

        applyRevealFillAnswer({
            isCodeInput: true,
            updateCurrent,
            patchCodeInput,
            fillPatch: {
                code: "print('solution')",
                codeLang: "python",
            } as any,
        });

        expect(updateCurrent).toHaveBeenCalledTimes(1);
        expect(patchCodeInput).not.toHaveBeenCalled();
    });
});