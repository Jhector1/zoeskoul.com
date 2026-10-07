"use client";

import React from "react";
import { useTranslations } from "next-intl";

import SharedReviewCourseModulesDrawer, {
    type ReviewCourseModulesDrawerLabels,
    type ReviewCourseModulesDrawerProps,
} from "@zoeskoul/learner-workspace/review/components/layout/ReviewCourseModulesDrawer";

export default function ReviewCourseModulesDrawer(
    props: ReviewCourseModulesDrawerProps,
) {
    const t = useTranslations("review.courseDrawer");

    const labels = React.useMemo<ReviewCourseModulesDrawerLabels>(
        () => ({
            title: t("title"),
            kicker: t("kicker"),
            description: t("description"),
            current: t("current"),
            locked: t("locked"),
            currentDescription: t("currentDescription"),
            lockedDescription: t("lockedDescription"),
            openDescription: t("openDescription"),
            loading: t("loading"),
            error: t("error"),
            empty: t("empty"),
        }),
        [t],
    );

    return (
        <SharedReviewCourseModulesDrawer
            {...props}
            labels={labels}
        />
    );
}
