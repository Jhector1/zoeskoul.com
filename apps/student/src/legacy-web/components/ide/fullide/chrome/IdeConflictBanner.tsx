"use client";

type Props = {
    projectTitle: string;
    serverVersion: number;
    clientBaseVersion: number | null;
    serverUpdatedAt: string;
    onReloadCloud: () => void;
    onSaveAsCopy: () => void;
    onDismiss: () => void;
};

const TOOL_BTN =
    "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[11px] font-medium transition-colors";

const TOOL_BTN_GHOST =
    "text-amber-800 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-400/10";

const TOOL_BTN_BORDER =
    "border border-amber-300/70 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-300/20 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-400/10";

const TOOL_BTN_PRIMARY =
    "border border-amber-500/20 bg-amber-500/15 text-amber-950 hover:bg-amber-500/20 dark:border-amber-300/20 dark:bg-amber-300/12 dark:text-amber-50 dark:hover:bg-amber-300/18";

export default function IdeConflictBanner({
                                              projectTitle,
                                              serverVersion,
                                              clientBaseVersion,
                                              serverUpdatedAt,
                                              onReloadCloud,
                                              onSaveAsCopy,
                                              onDismiss,
                                          }: Props) {
    return (
        <div className="border-b border-amber-200/80 bg-amber-50/90 px-3 py-2.5 dark:border-amber-500/15 dark:bg-amber-500/10">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-amber-950 dark:text-amber-100">
                        Newer cloud version detected for “{projectTitle}”.
                    </div>

                    <div className="mt-1 text-[11px] font-medium text-amber-800/90 dark:text-amber-100/75">
                        Local base: {clientBaseVersion ?? "unknown"} · Cloud: {serverVersion} · Updated{" "}
                        {new Date(serverUpdatedAt).toLocaleString()}
                    </div>

                    <div className="mt-1 text-[11px] font-medium text-amber-800/80 dark:text-amber-100/65">
                        Your local draft was kept. Reload the cloud version or save your local work as a copy.
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onSaveAsCopy}
                        className={`${TOOL_BTN} ${TOOL_BTN_BORDER}`}
                    >
                        Save Copy
                    </button>

                    <button
                        type="button"
                        onClick={onReloadCloud}
                        className={`${TOOL_BTN} ${TOOL_BTN_PRIMARY}`}
                    >
                        Reload Cloud
                    </button>

                    <button
                        type="button"
                        onClick={onDismiss}
                        className={`${TOOL_BTN} ${TOOL_BTN_GHOST}`}
                    >
                        Keep Local
                    </button>
                </div>
            </div>
        </div>
    );
}