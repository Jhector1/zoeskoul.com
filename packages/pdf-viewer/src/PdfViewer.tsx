"use client";

import * as React from "react";

import {
    PDF_DEFAULT_ZOOM,
    PDF_MAX_ZOOM,
    PDF_MIN_ZOOM,
    PDF_ZOOM_STEP,
    clampPdfZoom,
    resolvePdfCanvasOutputScale,
    resolvePdfPageScale,
} from "./scale";
import styles from "./PdfViewer.module.css";

const PDF_WORKER_SRC = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
).toString();

const DEFAULT_MAX_PAGES = 500;
const PAGE_GUTTER_PX = 32;
const MAX_CANVAS_PIXELS = 16_000_000;

type PdfViewport = {
    width: number;
    height: number;
};

type PdfRenderTask = {
    promise: Promise<void>;
    cancel(): void;
};

type PdfPageProxy = {
    getViewport(args: { scale: number }): PdfViewport;
    render(args: {
        canvasContext: CanvasRenderingContext2D;
        viewport: PdfViewport;
        transform?: number[];
        background?: string;
    }): PdfRenderTask;
    cleanup(): void;
};

type PdfDocumentProxy = {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageProxy>;
    destroy(): Promise<void>;
};

type PdfLoadingTask = {
    promise: Promise<PdfDocumentProxy>;
    destroy(): Promise<void>;
};

type PdfJsModule = {
    GlobalWorkerOptions: {
        workerSrc: string;
    };
    getDocument(args: {
        url: string;
        isEvalSupported: boolean;
        useWorkerFetch: boolean;
    }): PdfLoadingTask;
};

export type PdfViewerLabels = {
    toolbar: string;
    loading: string;
    loadError: string;
    pageError: string;
    previousPage: string;
    nextPage: string;
    zoomOut: string;
    zoomIn: string;
    fitWidth: string;
    page: string;
};

export type PdfViewerProps = {
    url: string;
    fileName: string;
    ariaLabel?: string;
    labels: PdfViewerLabels;
    className?: string;
    maxPages?: number;
};

type DocumentStatus = "loading" | "ready" | "error";
type PageStatus = "idle" | "loading" | "ready" | "error";

function useMeasuredWidth(ref: React.RefObject<HTMLElement | null>) {
    const [width, setWidth] = React.useState(0);
    const frameRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const measure = () => {
            if (frameRef.current != null) return;
            frameRef.current = window.requestAnimationFrame(() => {
                frameRef.current = null;
                const next = Math.max(0, Math.round(element.getBoundingClientRect().width));
                setWidth((current) => (current === next ? current : next));
            });
        };

        measure();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", measure);
            return () => {
                window.removeEventListener("resize", measure);
                if (frameRef.current != null) {
                    window.cancelAnimationFrame(frameRef.current);
                    frameRef.current = null;
                }
            };
        }

        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => {
            observer.disconnect();
            if (frameRef.current != null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [ref]);

    return width;
}

function PdfPageCanvas({
    documentProxy,
    pageNumber,
    availableWidth,
    zoom,
    scrollRootRef,
    errorLabel,
    pageLabel,
}: {
    documentProxy: PdfDocumentProxy;
    pageNumber: number;
    availableWidth: number;
    zoom: number;
    scrollRootRef: React.RefObject<HTMLDivElement | null>;
    errorLabel: string;
    pageLabel: string;
}) {
    const shellRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const [isNearViewport, setIsNearViewport] = React.useState(pageNumber === 1);
    const [status, setStatus] = React.useState<PageStatus>("idle");
    const [size, setSize] = React.useState(() => ({
        width: Math.max(1, availableWidth),
        height: Math.max(1, Math.round(availableWidth * 1.294)),
    }));

    React.useEffect(() => {
        const shell = shellRef.current;
        const root = scrollRootRef.current;
        if (!shell || !root || typeof IntersectionObserver === "undefined") {
            setIsNearViewport(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                setIsNearViewport(entries.some((entry) => entry.isIntersecting));
            },
            {
                root,
                rootMargin: "1200px 0px",
                threshold: 0,
            },
        );
        observer.observe(shell);
        return () => observer.disconnect();
    }, [scrollRootRef]);

    React.useEffect(() => {
        if (!isNearViewport || availableWidth <= 0) {
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.width = 1;
                canvas.height = 1;
                canvas.style.width = "1px";
                canvas.style.height = "1px";
            }
            setStatus("idle");
            return;
        }

        let disposed = false;
        let renderTask: PdfRenderTask | null = null;
        let pageProxy: PdfPageProxy | null = null;

        setStatus("loading");

        void (async () => {
            pageProxy = await documentProxy.getPage(pageNumber);
            if (disposed) {
                try {
                    pageProxy.cleanup();
                } catch {}
                return;
            }

            const baseViewport = pageProxy.getViewport({ scale: 1 });
            const scale = resolvePdfPageScale(
                baseViewport.width,
                availableWidth,
                zoom,
            );
            const viewport = pageProxy.getViewport({ scale });
            const canvas = canvasRef.current;
            if (!canvas || disposed) return;

            const outputScale = resolvePdfCanvasOutputScale({
                cssWidth: viewport.width,
                cssHeight: viewport.height,
                devicePixelRatio: window.devicePixelRatio || 1,
                maxPixels: MAX_CANVAS_PIXELS,
            });
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("Canvas rendering is unavailable.");

            const cssWidth = Math.max(1, Math.floor(viewport.width));
            const cssHeight = Math.max(1, Math.floor(viewport.height));
            canvas.width = Math.max(1, Math.floor(cssWidth * outputScale));
            canvas.height = Math.max(1, Math.floor(cssHeight * outputScale));
            canvas.style.width = `${cssWidth}px`;
            canvas.style.height = `${cssHeight}px`;
            setSize({ width: cssWidth, height: cssHeight });

            renderTask = pageProxy.render({
                canvasContext: context,
                viewport,
                transform:
                    outputScale === 1
                        ? undefined
                        : [outputScale, 0, 0, outputScale, 0, 0],
                background: "#ffffff",
            });
            await renderTask.promise;
            try {
                pageProxy.cleanup();
            } catch {}
            pageProxy = null;
            if (!disposed) setStatus("ready");
        })().catch((error: unknown) => {
            const name =
                error && typeof error === "object" && "name" in error
                    ? String((error as { name?: unknown }).name ?? "")
                    : "";
            if (!disposed && name !== "RenderingCancelledException") {
                setStatus("error");
            }
        });

        return () => {
            disposed = true;
            try {
                renderTask?.cancel();
            } catch {}
            try {
                pageProxy?.cleanup();
            } catch {}
        };
    }, [availableWidth, documentProxy, isNearViewport, pageNumber, zoom]);

    return (
        <div
            ref={shellRef}
            className={styles.pageShell}
            data-pdf-page-number={pageNumber}
            style={{ width: size.width, minHeight: size.height }}
        >
            <canvas
                ref={canvasRef}
                className={styles.canvas}
                role="img"
                aria-label={`${pageLabel} ${pageNumber}`}
            />
            {status === "loading" || status === "idle" ? (
                <div className={styles.pageStatus} aria-hidden="true" />
            ) : null}
            {status === "error" ? (
                <div className={styles.pageError} role="alert">
                    {errorLabel}
                </div>
            ) : null}
        </div>
    );
}

export function PdfViewer({
    url,
    fileName,
    ariaLabel,
    labels,
    className,
    maxPages = DEFAULT_MAX_PAGES,
}: PdfViewerProps) {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const [documentProxy, setDocumentProxy] =
        React.useState<PdfDocumentProxy | null>(null);
    const [status, setStatus] = React.useState<DocumentStatus>("loading");
    const [numPages, setNumPages] = React.useState(0);
    const [currentPage, setCurrentPage] = React.useState(1);
    const [zoom, setZoom] = React.useState(PDF_DEFAULT_ZOOM);
    const measuredWidth = useMeasuredWidth(rootRef);
    const availableWidth = Math.max(1, measuredWidth - PAGE_GUTTER_PX);

    React.useEffect(() => {
        let disposed = false;
        let loadingTask: PdfLoadingTask | null = null;
        let loadedDocument: PdfDocumentProxy | null = null;

        setStatus("loading");
        setDocumentProxy(null);
        setNumPages(0);
        setCurrentPage(1);
        setZoom(PDF_DEFAULT_ZOOM);

        void (async () => {
            const pdfjs = (await import("pdfjs-dist")) as unknown as PdfJsModule;
            pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
            loadingTask = pdfjs.getDocument({
                url,
                isEvalSupported: false,
                useWorkerFetch: true,
            });
            loadedDocument = await loadingTask.promise;

            if (disposed) {
                await loadedDocument.destroy();
                return;
            }
            if (loadedDocument.numPages < 1 || loadedDocument.numPages > maxPages) {
                await loadedDocument.destroy();
                loadedDocument = null;
                throw new Error("PDF page count is outside the supported range.");
            }

            setDocumentProxy(loadedDocument);
            setNumPages(loadedDocument.numPages);
            setStatus("ready");
        })().catch(() => {
            if (!disposed) setStatus("error");
        });

        return () => {
            disposed = true;
            const task = loadedDocument
                ? loadedDocument.destroy()
                : loadingTask?.destroy();
            void task?.catch(() => undefined);
        };
    }, [maxPages, url]);

    const updateCurrentPage = React.useCallback(() => {
        const root = scrollRef.current;
        if (!root) return;

        const rootRect = root.getBoundingClientRect();
        const center = rootRect.top + rootRect.height / 2;
        let bestPage = 1;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const element of root.querySelectorAll<HTMLElement>(
            "[data-pdf-page-number]",
        )) {
            const pageNumber = Number(element.dataset.pdfPageNumber);
            if (!Number.isInteger(pageNumber)) continue;
            const rect = element.getBoundingClientRect();
            const distance = Math.abs(rect.top + rect.height / 2 - center);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPage = pageNumber;
            }
        }

        setCurrentPage((current) => (current === bestPage ? current : bestPage));
    }, []);

    React.useEffect(() => {
        const root = scrollRef.current;
        if (!root || status !== "ready") return;

        let frame: number | null = null;
        const schedule = () => {
            if (frame != null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                updateCurrentPage();
            });
        };

        root.addEventListener("scroll", schedule, { passive: true });
        schedule();
        return () => {
            root.removeEventListener("scroll", schedule);
            if (frame != null) window.cancelAnimationFrame(frame);
        };
    }, [status, updateCurrentPage]);

    const goToPage = React.useCallback(
        (pageNumber: number) => {
            const next = Math.min(Math.max(pageNumber, 1), Math.max(numPages, 1));
            const target = scrollRef.current?.querySelector<HTMLElement>(
                `[data-pdf-page-number="${next}"]`,
            );
            const root = scrollRef.current;
            if (root && target) {
                root.scrollTo({
                    top: Math.max(0, target.offsetTop - 16),
                    behavior: "smooth",
                });
            }
            setCurrentPage(next);
        },
        [numPages],
    );

    const changeZoom = React.useCallback((delta: number) => {
        setZoom((current) => clampPdfZoom(current + delta));
    }, []);

    return (
        <div
            ref={rootRef}
            className={[styles.root, className ?? ""].join(" ")}
            aria-label={ariaLabel ?? fileName}
            data-testid="pdfjs-viewer"
        >
            <div className={styles.toolbar} role="toolbar" aria-label={labels.toolbar}>
                <div className={styles.toolbarGroup}>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={status !== "ready" || currentPage <= 1}
                        aria-label={labels.previousPage}
                        title={labels.previousPage}
                    >
                        ‹
                    </button>
                    <span className={styles.pageIndicator} aria-live="polite">
                        {status === "ready" ? `${currentPage} / ${numPages}` : "— / —"}
                    </span>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={status !== "ready" || currentPage >= numPages}
                        aria-label={labels.nextPage}
                        title={labels.nextPage}
                    >
                        ›
                    </button>
                </div>

                <div className={styles.toolbarGroup}>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={() => changeZoom(-PDF_ZOOM_STEP)}
                        disabled={status !== "ready" || zoom <= PDF_MIN_ZOOM}
                        aria-label={labels.zoomOut}
                        title={labels.zoomOut}
                    >
                        −
                    </button>
                    <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={() => changeZoom(PDF_ZOOM_STEP)}
                        disabled={status !== "ready" || zoom >= PDF_MAX_ZOOM}
                        aria-label={labels.zoomIn}
                        title={labels.zoomIn}
                    >
                        +
                    </button>
                    <button
                        type="button"
                        className={styles.fitButton}
                        onClick={() => setZoom(1)}
                        disabled={status !== "ready" || zoom === 1}
                        aria-label={labels.fitWidth}
                        title={labels.fitWidth}
                    >
                        {labels.fitWidth}
                    </button>
                </div>
            </div>

            <div ref={scrollRef} className={styles.scrollArea}>
                {status === "loading" ? (
                    <div className={styles.documentStatus} role="status">
                        {labels.loading}
                    </div>
                ) : null}
                {status === "error" ? (
                    <div className={styles.documentError} role="alert">
                        {labels.loadError}
                    </div>
                ) : null}
                {status === "ready" && documentProxy ? (
                    <div className={styles.pages}>
                        {Array.from({ length: numPages }, (_, index) => (
                            <PdfPageCanvas
                                key={index + 1}
                                documentProxy={documentProxy}
                                pageNumber={index + 1}
                                availableWidth={availableWidth}
                                zoom={zoom}
                                scrollRootRef={scrollRef}
                                errorLabel={labels.pageError}
                                pageLabel={labels.page}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
