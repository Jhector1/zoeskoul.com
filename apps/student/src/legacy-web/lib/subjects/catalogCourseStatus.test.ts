import { describe, expect, it } from "vitest";
import { resolveCatalogCourseStatusPresentation } from "./catalogCourseStatus";

describe("resolveCatalogCourseStatusPresentation", () => {
    it("treats an unversioned active course as available", () => {
        expect(
            resolveCatalogCourseStatusPresentation({
                status: "active",
                versioning: null,
            }),
        ).toEqual({
            availabilityLabel: "Available",
            lifecycleLabel: null,
        });
    });

    it("does not expose active versioning as learner progress", () => {
        expect(
            resolveCatalogCourseStatusPresentation({
                status: "active",
                versioning: { status: "active" },
            }),
        ).toEqual({
            availabilityLabel: "Available",
            lifecycleLabel: null,
        });
    });

    it("keeps publication availability and lifecycle diagnostics distinct", () => {
        expect(
            resolveCatalogCourseStatusPresentation({
                status: "active",
                versioning: { status: "legacy" },
            }),
        ).toEqual({
            availabilityLabel: "Available",
            lifecycleLabel: "Legacy version",
        });
    });

    it("labels coming-soon courses independently of versioning", () => {
        expect(
            resolveCatalogCourseStatusPresentation({
                status: "coming_soon",
                versioning: { status: "active" },
            }),
        ).toEqual({
            availabilityLabel: "Coming soon",
            lifecycleLabel: null,
        });
    });
});
