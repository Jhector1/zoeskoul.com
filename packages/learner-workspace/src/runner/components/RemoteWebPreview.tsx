"use client";

import React, { useMemo, useState } from "react";

import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";

function withRevision(src: string, revision: number) {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}__zb_preview_revision=${revision}`;
}

export default function RemoteWebPreview(props: {
    preview: RemoteWebPreviewDescriptor;
}) {
    const { preview } = props;
    const [localRefresh, setLocalRefresh] = useState(0);

    const iframeSrc = useMemo(
        () =>
            preview.src
                ? withRevision(preview.src, preview.revision + localRefresh)
                : null,
        [localRefresh, preview.revision, preview.src],
    );

    const statusLabel =
        preview.state === "starting"
            ? "Starting preview…"
            : preview.state === "syncing"
              ? "Updating preview…"
              : preview.state === "error"
                ? "Preview unavailable"
                : "Live preview";

    return (
        <div
            className="flex h-full min-h-0 flex-col bg-white dark:bg-black/40"
            data-remote-web-preview
            data-preview-state={preview.state}
        >
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-white/10 dark:bg-neutral-950">
                <button
                    type="button"
                    aria-label={
                        preview.state === "error"
                            ? "Retry browser preview"
                            : "Refresh browser preview"
                    }
                    title={preview.state === "error" ? "Retry" : "Refresh"}
                    onClick={() => {
                        if (preview.state === "error") {
                            preview.onRetry?.();
                            return;
                        }
                        setLocalRefresh((value) => value + 1);
                    }}
                    disabled={!iframeSrc && preview.state !== "error"}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm font-bold text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900 dark:text-white/70 dark:hover:bg-neutral-800"
                >
                    ↻
                </button>

                <input
                    aria-label="Preview URL"
                    value={preview.src ?? statusLabel}
                    readOnly
                    data-testid="remote-web-preview-url"
                    className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[11px] text-neutral-600 outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-white/70"
                />

                <span
                    className="shrink-0 text-[11px] font-semibold text-neutral-500 dark:text-white/55"
                    aria-live="polite"
                >
                    {statusLabel}
                </span>
            </div>

            <div className="relative min-h-0 flex-1">
                {iframeSrc && preview.state !== "error" ? (
                    <iframe
                        key={iframeSrc}
                        title={preview.title ?? "Web preview"}
                        src={iframeSrc}
                        sandbox="allow-scripts allow-forms allow-modals"
                        data-remote-web-preview-frame
                        className="h-full w-full border-0 bg-white"
                        style={{ colorScheme: "light", backgroundColor: "#ffffff" }}
                    />
                ) : (
                    <div
                        className="flex h-full min-h-[240px] items-center justify-center bg-white p-6 text-center dark:bg-black/30"
                        role={preview.state === "error" ? "alert" : "status"}
                    >
                        <div className="max-w-md">
                            <strong className="block text-sm text-neutral-800 dark:text-white/85">
                                {statusLabel}
                            </strong>
                            {preview.message ? (
                                <p className="mt-2 text-xs leading-5 text-neutral-500 dark:text-white/55">
                                    {preview.message}
                                </p>
                            ) : null}
                            {preview.state === "error" && preview.onRetry ? (
                                <button
                                    type="button"
                                    className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-white/75"
                                    onClick={() => preview.onRetry?.()}
                                >
                                    Retry preview
                                </button>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
