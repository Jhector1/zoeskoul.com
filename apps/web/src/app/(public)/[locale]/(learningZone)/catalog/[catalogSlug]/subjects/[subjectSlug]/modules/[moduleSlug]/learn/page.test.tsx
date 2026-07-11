import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    redirect: vi.fn(),
    loadReviewModulePageData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    redirect: mocks.redirect,
}));

vi.mock(
    "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData",
    () => ({
        loadReviewModulePageData: mocks.loadReviewModulePageData,
    }),
);

vi.mock(
    "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient",
    () => ({
        default: () => React.createElement("div", { "data-testid": "review-module-page" }),
    }),
);

import Page from "./page";

const firstTopic = {
    id: "python-8-thinking-in-objects",
    cards: [
        {
            id: "object-intuition",
            type: "text",
        },
    ],
};

const mod = {
    topics: [firstTopic],
    sections: [
        {
            slug: "python-8-object-oriented-foundations",
            topics: [firstTopic],
        },
    ],
};

describe("catalog review module landing route", () => {
    beforeEach(() => {
        mocks.redirect.mockReset();
        mocks.loadReviewModulePageData.mockReset();
        mocks.loadReviewModulePageData.mockResolvedValue({
            mod,
            canUnlockAll: false,
            catalogSlug: "python",
        });
    });

    it("redirects the short catalog module URL to its first canonical lesson target", async () => {
        await Page({
            params: Promise.resolve({
                locale: "en",
                catalogSlug: "python",
                subjectSlug: "applied-python-projects",
                moduleSlug: "python-8-object-oriented-foundations",
            }),
        });

        expect(mocks.redirect).toHaveBeenCalledWith(
            "/en/catalog/python/subjects/applied-python-projects/modules/python-8-object-oriented-foundations/learn/python-8-object-oriented-foundations/python-8-thinking-in-objects/text/object-intuition",
        );
    });

    it("uses the catalog slug from the requested URL instead of a separately resolved catalog", async () => {
        mocks.loadReviewModulePageData.mockResolvedValue({
            mod,
            canUnlockAll: false,
            catalogSlug: "wrong-catalog",
        });

        await Page({
            params: Promise.resolve({
                locale: "en",
                catalogSlug: "python",
                subjectSlug: "applied-python-projects",
                moduleSlug: "python-8-object-oriented-foundations",
            }),
        });

        expect(mocks.redirect).toHaveBeenCalledWith(
            expect.stringContaining("/catalog/python/"),
        );
        expect(mocks.redirect).not.toHaveBeenCalledWith(
            expect.stringContaining("/catalog/wrong-catalog/"),
        );
    });
});
