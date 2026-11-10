"use client";

type Props = {
    projectTitle: string;
    serverVersion: number;
    clientBaseVersion: number | null;
};

/** Notice only: the header's Resolve action is the one entry point. */
export default function IdeConflictBanner({projectTitle, serverVersion, clientBaseVersion}: Props) {
    return (
        <div role="status" className="border-b border-amber-200/70 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900 dark:border-amber-300/15 dark:bg-amber-300/[0.07] dark:text-amber-100/90">
            <span className="font-semibold">Newer cloud version:</span>{" "}
            <span className="font-medium">{projectTitle}</span>{" "}
            <span className="text-amber-800/80 dark:text-amber-100/60">
                (local v{clientBaseVersion ?? "?"} · cloud v{serverVersion}).
            </span>{" "}
            Your current edits remain in the browser. Choose <strong>Resolve</strong> to review options.
        </div>
    );
}
