"use client";

import * as React from "react";

export function ChatGPTSplitLauncher({
                                         promptToCopy,
                                     }: {
    promptToCopy: string;
}) {
    const openChatGPTSideWindow = React.useCallback(async () => {
        // 1) Copy the prompt so the learner can paste immediately
        try {
            await navigator.clipboard.writeText(promptToCopy);
        } catch {
            // Clipboard may fail if permissions are blocked — that's ok.
        }

        // 2) Open ChatGPT in a "right-side" popup window
        const screenW = window.screen.availWidth;
        const screenH = window.screen.availHeight;

        const leftWidth = Math.floor(screenW * 0.42);   // your app (approx)
        const chatWidth = screenW - leftWidth;          // chat window (approx)

        const features = [
            `popup=yes`,
            `width=${chatWidth}`,
            `height=${screenH}`,
            `left=${leftWidth}`,
            `top=0`,
            `resizable=yes`,
            `scrollbars=yes`,
        ].join(",");

        const w = window.open("https://chatgpt.com/", "chatgpt_side", features);

        // If popup blocked, fallback: open in new tab
        if (!w) window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    }, [promptToCopy]);

    return (
        <button
            type="button"
            onClick={openChatGPTSideWindow}
            className="ui-btn ui-btn-primary"
            title="Opens ChatGPT and copies the prompt"
        >
            Open ChatGPT (side) + Copy prompt
        </button>
    );
}
