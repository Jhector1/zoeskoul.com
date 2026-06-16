import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import XtermTerminal from "@/components/code/runner/components/XtermTerminal";

describe("XtermTerminal", () => {
    it("does not show Interactive when the terminal is disconnected", () => {
        const html = renderToStaticMarkup(
            <XtermTerminal
                terminalFeed={[]}
                inputEnabled
                interactiveReady={false}
                busy={false}
                disabled={false}
                lastResult={null}
                onSendData={vi.fn()}
                onResize={vi.fn()}
                recoverState="restart_available"
                recoverMessage="Terminal session is disconnected."
            />,
        );

        expect(html).toContain("Terminal session is disconnected.");
        expect(html).not.toContain(">Interactive<");
        expect(html).toContain(">Idle<");
    });

    it("shows the timeout recovery prompt with a restart action", () => {
        const html = renderToStaticMarkup(
            <XtermTerminal
                terminalFeed={[]}
                inputEnabled={false}
                interactiveReady={false}
                busy={false}
                disabled={false}
                lastResult={null}
                onSendData={vi.fn()}
                onResize={vi.fn()}
                recoverState="restart_available"
                recoverMessage="Session timed out from inactivity."
                onRestart={vi.fn()}
            />,
        );

        expect(html).toContain("Session timed out from inactivity.");
        expect(html).toContain('aria-label="Restart terminal"');
    });
});
