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
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="font-extrabold">
                        Newer cloud version detected for "{projectTitle}".
                    </div>
                    <div className="mt-1 text-xs font-medium opacity-90">
                        Local base version: {clientBaseVersion ?? "unknown"} · Cloud version: {serverVersion} ·
                        Cloud updated: {new Date(serverUpdatedAt).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs opacity-80">
                        Your local draft was kept. Reload the cloud version or save your local work as a copy.
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onSaveAsCopy}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-amber-900 hover:bg-amber-100 dark:border-amber-300/20 dark:bg-transparent dark:text-amber-50 dark:hover:bg-amber-400/10"
                    >
                        Save As Copy
                    </button>

                    <button
                        type="button"
                        onClick={onReloadCloud}
                        className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-amber-700"
                    >
                        Reload Cloud Version
                    </button>

                    <button
                        type="button"
                        onClick={onDismiss}
                        className="rounded-lg border border-transparent px-3 py-2 text-xs font-extrabold text-amber-900 hover:bg-amber-100 dark:text-amber-50 dark:hover:bg-amber-400/10"
                    >
                        Keep Local Draft
                    </button>
                </div>
            </div>
        </div>
    );
}