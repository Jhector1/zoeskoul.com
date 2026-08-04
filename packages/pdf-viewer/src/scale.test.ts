import { describe, expect, it } from "vitest";

import {
    PDF_DEFAULT_ZOOM,
    PDF_MAX_ZOOM,
    PDF_MIN_ZOOM,
    PDF_ZOOM_STEP,
    clampPdfZoom,
    resolvePdfCanvasOutputScale,
    resolvePdfPageScale,
} from "./scale";

describe("PDF viewer scale helpers", () => {
    it("clamps invalid and out-of-range zoom values", () => {
        expect(PDF_DEFAULT_ZOOM).toBe(0.5);
        expect(PDF_MIN_ZOOM).toBe(0.05);
        expect(PDF_MAX_ZOOM).toBe(5);
        expect(PDF_ZOOM_STEP).toBe(0.05);
        expect(clampPdfZoom(Number.NaN)).toBe(PDF_DEFAULT_ZOOM);
        expect(clampPdfZoom(0.01)).toBe(PDF_MIN_ZOOM);
        expect(clampPdfZoom(10)).toBe(PDF_MAX_ZOOM);
    });

    it("fits a page to the available width before applying zoom", () => {
        expect(resolvePdfPageScale(800, 400, 1)).toBe(0.5);
        expect(resolvePdfPageScale(800, 400, 2)).toBe(1);
    });

    it("caps canvas resolution by device ratio and maximum pixels", () => {
        expect(
            resolvePdfCanvasOutputScale({
                cssWidth: 1000,
                cssHeight: 1000,
                devicePixelRatio: 2,
                maxPixels: 4_000_000,
            }),
        ).toBe(2);

        expect(
            resolvePdfCanvasOutputScale({
                cssWidth: 2000,
                cssHeight: 2000,
                devicePixelRatio: 2,
                maxPixels: 4_000_000,
            }),
        ).toBe(1);
    });
});
