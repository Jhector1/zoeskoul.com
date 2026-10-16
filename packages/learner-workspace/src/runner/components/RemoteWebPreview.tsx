"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";

type FrameIndex = 0 | 1;

function withRevision(src: string, revision: number) {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}__zb_preview_revision=${revision}`;
}

function otherFrame(index: FrameIndex): FrameIndex {
    return index === 0 ? 1 : 0;
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

    const [frameSources, setFrameSources] = useState<
        [string | null, string | null]
    >([null, null]);
    const [activeFrame, setActiveFrame] = useState<FrameIndex | null>(null);
    const expiredCandidateRef = useRef<string | null>(null);

    const activeSrc =
        activeFrame === null ? null : frameSources[activeFrame];

    useEffect(() => {
        if (!iframeSrc) {
            if (activeFrame === null) {
                setFrameSources([null, null]);
            }
            return;
        }

        if (activeSrc === iframeSrc) return;

        const controller = new AbortController();
        let cancelled = false;

        void (async () => {
            try {
                const response = await fetch(iframeSrc, {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    signal: controller.signal,
                });

                if (cancelled) return;

                if (!response.ok) {
                    if (
                        response.status === 404 &&
                        expiredCandidateRef.current !== iframeSrc
                    ) {
                        expiredCandidateRef.current = iframeSrc;
                        preview.onRetry?.();
                    }
                    return;
                }

                expiredCandidateRef.current = null;

                setFrameSources((current) => {
                    const target: FrameIndex =
                        activeFrame === null ? 0 : otherFrame(activeFrame);

                    if (current[target] === iframeSrc) {
                        return current;
                    }

                    const next: [string | null, string | null] = [...current];
                    next[target] = iframeSrc;
                    return next;
                });
            } catch (error) {
                if (
                    error instanceof DOMException &&
                    error.name === "AbortError"
                ) {
                    return;
                }
            }
        })();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [activeFrame, activeSrc, iframeSrc, preview.onRetry]);

    const statusLabel =
        preview.state === "starting"
            ? "Starting preview…"
            : preview.state === "syncing"
              ? "Updating preview…"
              : preview.state === "error"
                ? "Preview unavailable"
                : "Live preview";

    const displayUrl = preview.src ? "/" : statusLabel;

    function activateFrame(index: FrameIndex, src: string) {
        if (src !== iframeSrc) return;

        setActiveFrame(index);
        setFrameSources((current) => {
            if (current[index] !== src) return current;

            const previous = otherFrame(index);
            if (current[previous] === null) return current;

            const next: [string | null, string | null] = [...current];
            next[previous] = null;
            return next;
        });
    }

    const showStatusSurface =
        preview.state === "error" || activeFrame === null;

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
                    value={displayUrl}
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

            <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
                {frameSources.map((src, rawIndex) => {
                    if (!src) return null;

                    const index = rawIndex as FrameIndex;
                    const isActive =
                        preview.state !== "error" && index === activeFrame;

                    return (
                        <iframe
                            key={index}
                            title={preview.title ?? "Web preview"}
                            src={src}
                            sandbox="allow-scripts allow-forms allow-modals"
                            data-remote-web-preview-frame
                            data-preview-frame-active={
                                isActive ? "true" : "false"
                            }
                            aria-hidden={!isActive}
                            onLoad={() => activateFrame(index, src)}
                            className={[
                                "absolute inset-0 h-full w-full border-0 bg-white",
                                isActive
                                    ? "z-10 opacity-100"
                                    : "pointer-events-none z-0 opacity-0",
                            ].join(" ")}
                            style={{
                                colorScheme: "light",
                                backgroundColor: "#ffffff",
                            }}
                        />
                    );
                })}

                {showStatusSurface ? (
                    <div
                        className="absolute inset-0 z-20 flex h-full min-h-[240px] items-center justify-center bg-white p-6 text-center dark:bg-black/30"
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
                ) : null}
            </div>
        </div>
    );
}
