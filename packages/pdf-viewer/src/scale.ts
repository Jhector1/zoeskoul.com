export const PDF_DEFAULT_ZOOM = 0.5;
export const PDF_MIN_ZOOM = 0.05;
export const PDF_MAX_ZOOM = 5;
export const PDF_ZOOM_STEP = 0.05;

export function clampPdfZoom(value: number) {
    if (!Number.isFinite(value)) return PDF_DEFAULT_ZOOM;
    return Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, value));
}

export function resolvePdfPageScale(
    unscaledPageWidth: number,
    availableWidth: number,
    zoom: number,
) {
    const safePageWidth = Math.max(1, unscaledPageWidth);
    const safeAvailableWidth = Math.max(1, availableWidth);
    return (safeAvailableWidth / safePageWidth) * clampPdfZoom(zoom);
}

export function resolvePdfCanvasOutputScale(args: {
    cssWidth: number;
    cssHeight: number;
    devicePixelRatio: number;
    maxPixels: number;
}) {
    const cssPixels = Math.max(1, args.cssWidth) * Math.max(1, args.cssHeight);
    const requested = Math.min(2, Math.max(1, args.devicePixelRatio || 1));
    const pixelCap = Math.sqrt(Math.max(1, args.maxPixels) / cssPixels);
    return Math.max(0.25, Math.min(requested, pixelCap));
}
