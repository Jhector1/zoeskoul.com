"use client";

import React from "react";
import {
    Archive,
    Download,
    FileAudio,
    FileImage,
    FileQuestion,
    FileText,
    FileVideo,
    Minus,
    Plus,
    Scan,
    Type,
} from "lucide-react";
import { useLearnerWorkspaceTranslations as useTranslations } from "@zoeskoul/learner-workspace/runtime/appRuntime";
import {
    normalizeWorkspaceBase64,
    resolveWorkspaceFileCapability,
    workspaceBase64DecodedByteLength,
} from "@zoeskoul/code-contracts";
import { PdfViewer } from "@zoeskoul/pdf-viewer";

import type { BinaryFileContent } from "@zoeskoul/learner-workspace/ide/types";

export type BinaryFileViewerProps = {
    fileName: string;
    binary: BinaryFileContent;
    className?: string;
};

function decodeBase64(data: string, expectedSize: number) {
    const normalized = normalizeWorkspaceBase64(data);
    const decodedSize = workspaceBase64DecodedByteLength(data);
    if (normalized == null || decodedSize == null || decodedSize !== expectedSize) {
        throw new Error("Invalid binary payload.");
    }
    if (!normalized) return new Uint8Array();

    const decoded = window.atob(normalized);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
}

function formatBytes(size: number) {
    if (!Number.isFinite(size) || size <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const unitIndex = Math.min(
        Math.floor(Math.log(size) / Math.log(1024)),
        units.length - 1,
    );
    const value = size / 1024 ** unitIndex;
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function useBinaryObjectUrl(binary: BinaryFileContent) {
    const [url, setUrl] = React.useState<string | null>(null);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        setError(false);
        setUrl(null);

        try {
            const bytes = decodeBase64(binary.data, binary.sizeBytes);
            const blob = new Blob([bytes], {
                type: binary.mimeType || "application/octet-stream",
            });
            const nextUrl = URL.createObjectURL(blob);
            setUrl(nextUrl);
            return () => URL.revokeObjectURL(nextUrl);
        } catch {
            setError(true);
            return undefined;
        }
    }, [binary.data, binary.mimeType, binary.sizeBytes]);

    return { url, error };
}

function ViewerIcon({ viewer }: { viewer: string }) {
    const className = "h-5 w-5";
    if (viewer === "image") return <FileImage className={className} aria-hidden="true" />;
    if (viewer === "pdf") return <FileText className={className} aria-hidden="true" />;
    if (viewer === "audio") return <FileAudio className={className} aria-hidden="true" />;
    if (viewer === "video") return <FileVideo className={className} aria-hidden="true" />;
    if (viewer === "font") return <Type className={className} aria-hidden="true" />;
    if (viewer === "archive") return <Archive className={className} aria-hidden="true" />;
    return <FileQuestion className={className} aria-hidden="true" />;
}

export default function BinaryFileViewer({
    fileName,
    binary,
    className,
}: BinaryFileViewerProps) {
    const t = useTranslations("ide.editor.binary");
    const pdfT = useTranslations("ide.pdfViewer");
    const capability = resolveWorkspaceFileCapability(fileName);
    const viewer = capability?.storage === "binary" ? capability.viewer : "details";
    const { url, error } = useBinaryObjectUrl(binary);
    const fontFamily = React.useId().replace(/:/g, "");
    const [imageZoom, setImageZoom] = React.useState<number | null>(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const [pan, setPan] = React.useState({x: 0, y: 0});
    const panOffset = React.useRef({x: 0, y: 0});
    const panViewport = React.useRef<HTMLDivElement>(null);
    const panImage = React.useRef<HTMLImageElement>(null);
    const panStart = React.useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
    React.useEffect(() => {
        setImageZoom(null);
        setPan({x:0,y:0});
        panOffset.current = {x:0,y:0};
        setIsPanning(false);
        panStart.current = null;
    }, [fileName, binary.data]);

    const clampPan = (x: number, y: number) => {
        const pane = panViewport.current;
        const image = panImage.current;
        if (!pane || !image) return {x: 0, y: 0};
        const width = image.offsetWidth;
        const height = image.offsetHeight;
        // When smaller than the pane, keep the image entirely visible.
        // When larger, permit reaching all four edges without revealing empty gaps.
        const dx = Math.abs(width - pane.clientWidth) / 2;
        const dy = Math.abs(height - pane.clientHeight) / 2;
        return {x: Math.max(-dx, Math.min(dx, x)), y: Math.max(-dy, Math.min(dy, y))};
    };
    const beginImagePan = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.button !== 0 || !panImage.current) return;
        panStart.current = {
            pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            left: panOffset.current.x, top: panOffset.current.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsPanning(true);
        event.preventDefault();
    };
    const moveImagePan = (event: React.PointerEvent<HTMLDivElement>) => {
        const start = panStart.current;
        if (!start || start.pointerId !== event.pointerId) return;
        const next = clampPan(start.left + event.clientX - start.x, start.top + event.clientY - start.y);
        panOffset.current = next;
        setPan(next);
        event.preventDefault();
    };
    const endImagePan = (event: React.PointerEvent<HTMLDivElement>) => {
        if (panStart.current?.pointerId !== event.pointerId) return;
        panStart.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setIsPanning(false);
    };
    const zoomImage = (direction: -1 | 1) => {
        setImageZoom(current => Math.max(0.25, Math.min(4, Math.round(((current ?? 1) + direction * 0.25) * 100) / 100)));
        panOffset.current = {x:0,y:0};
        setPan({x:0,y:0});
    };

    const download = React.useCallback(() => {
        if (!url) return;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = "noopener";
        anchor.click();
    }, [fileName, url]);

    const preview = (() => {
        if (error) {
            return (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-rose-700 dark:text-rose-300">
                    {t("invalidData")}
                </div>
            );
        }

        if (!url) {
            return (
                <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500 dark:text-white/50">
                    {t("loading")}
                </div>
            );
        }

        if (viewer === "image") {
            return (
                <div className="flex h-full min-h-0 min-w-0 flex-col">
                    <div className="flex shrink-0 items-center justify-center gap-1 border-b border-neutral-200 bg-neutral-50 px-2 py-1 dark:border-white/10 dark:bg-neutral-900/80" role="toolbar" aria-label="Image zoom">
                        <button type="button" onClick={() => zoomImage(-1)} aria-label="Zoom out" title="Zoom out" className="rounded p-1.5 text-neutral-600 hover:bg-neutral-200 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10" disabled={imageZoom !== null && imageZoom <= 0.25}><Minus className="h-4 w-4" /></button>
                        <span aria-live="polite" className="min-w-12 text-center font-mono text-[11px] text-neutral-600 dark:text-neutral-300">{imageZoom === null ? "Fit" : `${Math.round(imageZoom * 100)}%`}</span>
                        <button type="button" onClick={() => zoomImage(1)} aria-label="Zoom in" title="Zoom in" className="rounded p-1.5 text-neutral-600 hover:bg-neutral-200 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10" disabled={imageZoom !== null && imageZoom >= 4}><Plus className="h-4 w-4" /></button>
                        <button type="button" onClick={() => {setImageZoom(null); panOffset.current={x:0,y:0}; setPan({x:0,y:0});}} aria-label="Fit image to pane" title="Fit image to pane" className="ml-2 inline-flex items-center gap-1 rounded px-2 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-white/10"><Scan className="h-3.5 w-3.5"/> Fit</button>
                    </div>
                    <div
                        role="region"
                        ref={panViewport}
                        aria-label="Image preview; drag to reposition, or zoom and drag to inspect"
                        onPointerDown={beginImagePan}
                        onPointerMove={moveImagePan}
                        onPointerUp={endImagePan}
                        onPointerCancel={endImagePan}
                        onLostPointerCapture={endImagePan}
                        className={`min-h-0 min-w-0 flex-1 overflow-hidden overscroll-contain bg-[linear-gradient(45deg,rgba(127,127,127,.08)_25%,transparent_25%),linear-gradient(-45deg,rgba(127,127,127,.08)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(127,127,127,.08)_75%),linear-gradient(-45deg,transparent_75%,rgba(127,127,127,.08)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] ${isPanning ? "cursor-grabbing select-none" : "cursor-grab"}`}
                        style={{ touchAction: "none" }}
                    >
                        <div className="flex h-full w-full items-center justify-center overflow-hidden p-4">
                            {/* Fit never enlarges the original; manual zoom enlarges within a scrollable area. */}
                            <img
                                src={url}
                                ref={panImage}
                                alt={t("imageAlt", { fileName })}
                                draggable={false}
                                className={imageZoom === null ? "block h-auto w-auto max-h-full max-w-full object-contain shadow-sm" : "block h-auto max-w-none shrink-0 object-contain shadow-sm"}
                                style={imageZoom === null ? { maxHeight: "100%", transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` } : { width: `${Math.round(imageZoom * 100)}%`, transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}
                            />
                        </div>
                    </div>
                </div>
            );
        }

        if (viewer === "pdf") {
            return (
                <PdfViewer
                    url={url}
                    fileName={fileName}
                    ariaLabel={t("pdfTitle", { fileName })}
                    labels={{
                        toolbar: pdfT("toolbar"),
                        loading: pdfT("loading"),
                        loadError: pdfT("loadError"),
                        pageError: pdfT("pageError"),
                        previousPage: pdfT("previousPage"),
                        nextPage: pdfT("nextPage"),
                        zoomOut: pdfT("zoomOut"),
                        zoomIn: pdfT("zoomIn"),
                        fitWidth: pdfT("fitWidth"),
                        page: pdfT("page"),
                    }}
                    className="h-full w-full"
                />
            );
        }

        if (viewer === "audio") {
            return (
                <div className="flex h-full items-center justify-center p-8">
                    <audio controls preload="metadata" className="w-full max-w-2xl" src={url}>
                        {t("audioUnsupported")}
                    </audio>
                </div>
            );
        }

        if (viewer === "video") {
            return (
                <div className="flex h-full items-center justify-center overflow-auto bg-black p-4">
                    <video
                        controls
                        preload="metadata"
                        className="max-h-full max-w-full rounded-md"
                        src={url}
                    >
                        {t("videoUnsupported")}
                    </video>
                </div>
            );
        }

        if (viewer === "font") {
            const family = `zoe-binary-font-${fontFamily}`;
            return (
                <div className="h-full overflow-auto p-8 sm:p-12">
                    <style>{`@font-face { font-family: "${family}"; src: url("${url}"); font-display: swap; }`}</style>
                    <div className="mx-auto max-w-4xl space-y-8">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
                            {t("fontSample")}
                        </p>
                        <p style={{ fontFamily: family }} className="break-words text-5xl leading-tight text-neutral-950 dark:text-white sm:text-7xl">
                            Aa Bb Cc 0123
                        </p>
                        <p style={{ fontFamily: family }} className="break-words text-2xl leading-relaxed text-neutral-800 dark:text-white/85">
                            The quick brown fox jumps over the lazy dog.
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="max-w-lg rounded-xl border border-neutral-200 bg-white/80 p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 dark:bg-white/[0.06] dark:text-white/65">
                        <ViewerIcon viewer={viewer} />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-neutral-900 dark:text-white/90">
                        {viewer === "archive" ? t("archiveTitle") : t("detailsTitle")}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/55">
                        {viewer === "archive" ? t("archiveMessage") : t("detailsMessage")}
                    </p>
                </div>
            </div>
        );
    })();

    return (
        <section
            className={[
                "flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-neutral-950",
                className ?? "",
            ].join(" ")}
            data-testid="binary-file-viewer"
            data-viewer={viewer}
        >
            <header className="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2 dark:border-white/10">
                <div className="flex min-w-0 items-center gap-2 text-neutral-600 dark:text-white/65">
                    <ViewerIcon viewer={viewer} />
                    <div className="min-w-0">
                        <div className="truncate text-[10px] text-neutral-500 dark:text-white/45">
                            {binary.mimeType} · {formatBytes(binary.sizeBytes)}
                        </div>
                        {binary.checksum ? (
                            <div
                                className="max-w-[24rem] truncate font-mono text-[9px] text-neutral-400 dark:text-white/35"
                                title={binary.checksum}
                            >
                                {binary.checksum}
                            </div>
                        ) : null}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={download}
                    disabled={!url}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-white/75 dark:hover:bg-white/[0.06]"
                >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("download")}
                </button>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">{preview}</div>
        </section>
    );
}
