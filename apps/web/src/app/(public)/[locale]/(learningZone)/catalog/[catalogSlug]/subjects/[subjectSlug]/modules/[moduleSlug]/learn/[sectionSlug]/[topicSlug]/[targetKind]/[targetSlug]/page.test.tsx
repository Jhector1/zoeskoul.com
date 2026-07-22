import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    redirect: vi.fn(),
    notFound: vi.fn(),
    loadReviewModulePageData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    redirect: mocks.redirect,
    notFound: mocks.notFound,
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
        default: (props: Record<string, unknown>) =>
            React.createElement("div", {
                "data-page-status": props.pageStatus,
                "data-can-unlock-all": props.canUnlockAll,
            }),
    }),
);

import Page from "./page";

const firstTopic = {
    id: "repository-basics",
    cards: [
        {
            id: "why-version-control-matters",
            type: "text",
        },
    ],
};

const mod = {
    topics: [firstTopic],
    sections: [
        {
            slug: "repository-foundations",
            topics: [firstTopic],
        },
    ],
};

const canonicalParams = {
    locale: "en",
    catalogSlug: "git",
    subjectSlug: "git-foundations",
    moduleSlug: "git-foundations-module-1-start-tracking",
    sectionSlug: "repository-foundations",
    topicSlug: "repository-basics",
    targetKind: "text",
    targetSlug: "why-version-control-matters",
};

describe("catalog review lesson route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.loadReviewModulePageData.mockResolvedValue({
            status: "ready",
            mod,
            canUnlockAll: false,
            catalogSlug: "git",
        });
    });

    it("renders a directly loaded canonical lesson URL", async () => {
        const result = await Page({
            params: Promise.resolve(canonicalParams),
            searchParams: Promise.resolve({}),
        });

        expect(mocks.notFound).not.toHaveBeenCalled();
        expect(mocks.redirect).not.toHaveBeenCalled();
        expect(
            (result as React.ReactElement<{ pageStatus?: string }>).props.pageStatus,
        ).toBe("ready");
    });

    it("canonicalizes stale section segments on the server", async () => {
        await Page({
            params: Promise.resolve({
                ...canonicalParams,
                sectionSlug: "old-section-slug",
            }),
            searchParams: Promise.resolve({ e2eUnlockAll: "1" }),
        });

        expect(mocks.redirect).toHaveBeenCalledWith(
            "/en/catalog/git/subjects/git-foundations/modules/git-foundations-module-1-start-tracking/learn/repository-foundations/repository-basics/text/why-version-control-matters?e2eUnlockAll=1",
        );
    });

    it("redirects an obsolete target to the module default instead of rendering a dead URL", async () => {
        await Page({
            params: Promise.resolve({
                ...canonicalParams,
                targetKind: "exercise",
                targetSlug: "removed-exercise",
            }),
            searchParams: Promise.resolve({}),
        });

        expect(mocks.redirect).toHaveBeenCalledWith(
            "/en/catalog/git/subjects/git-foundations/modules/git-foundations-module-1-start-tracking/learn/repository-foundations/repository-basics/text/why-version-control-matters",
        );
    });

    it("renders an availability state for an existing unpublished module", async () => {
        mocks.loadReviewModulePageData.mockResolvedValue({
            status: "unavailable",
            mod: null,
            canUnlockAll: false,
            catalogSlug: "git",
        });

        const result = await Page({
            params: Promise.resolve(canonicalParams),
            searchParams: Promise.resolve({}),
        });

        expect(mocks.notFound).not.toHaveBeenCalled();
        expect(
            (result as React.ReactElement<{ pageStatus?: string }>).props.pageStatus,
        ).toBe("unavailable");
    });

    it("uses a real 404 only for a genuinely missing compiled module", async () => {
        mocks.loadReviewModulePageData.mockResolvedValue({
            status: "missing",
            mod: null,
            canUnlockAll: false,
            catalogSlug: "git",
        });

        await Page({
            params: Promise.resolve(canonicalParams),
            searchParams: Promise.resolve({}),
        });

        expect(mocks.notFound).toHaveBeenCalledTimes(1);
    });
});
