"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { getOptionalClientMessage } from "../i18n/getOptionalClientMessage";
import type { SubjectFinishState } from "../types/subjectFinish.types";

export function useSubjectFinishCopy(args: {
    subjectSlug: string;
    subjectFinish: SubjectFinishState | null;
}) {
    const { subjectSlug, subjectFinish } = args;
    const t = useTranslations();

    return useMemo(() => {
        const headlineMoreComing = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.headline.moreComing",
            "You finished everything published so far",
        );

        const headlineRewardReady = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.headline.rewardReady",
            "Course complete",
        );

        const headlineCertificateReady = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.headline.certificateReady",
            "Course complete",
        );

        const headlineKeepGoing = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.headline.keepGoing",
            "Keep going",
        );

        const genericMoreComing = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.body.moreComing",
            "More modules are coming soon.",
        );

        const subjectMoreComing = getOptionalClientMessage(
            t as any,
            `subjects.${subjectSlug}.moreComingSoon`,
            genericMoreComing,
        );

        const rewardReady = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.body.rewardReady",
            "You unlocked the final reward.",
        );

        const certificateReady = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.body.certificateReady",
            "You can now claim your certificate.",
        );

        const keepGoing = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.body.keepGoing",
            "Complete the remaining requirements.",
        );

        const getCertificate = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.cta.getCertificate",
            "Get certificate →",
        );

        const viewCertificate = getOptionalClientMessage(
            t as any,
            "review.subjectFinish.cta.viewCertificate",
            "View certificate →",
        );

        const status = subjectFinish?.status;

        const headline =
            status === "more_coming"
                ? headlineMoreComing
                : status === "reward_ready"
                    ? headlineRewardReady
                    : status === "certificate_ready" || status === "certificate_issued"
                        ? headlineCertificateReady
                        : headlineKeepGoing;

        const body =
            status === "more_coming"
                ? subjectMoreComing
                : status === "reward_ready"
                    ? rewardReady
                    : status === "certificate_ready" || status === "certificate_issued"
                        ? certificateReady
                        : keepGoing;

        const certificateCta = subjectFinish?.certificateIssued
            ? viewCertificate
            : getCertificate;

        return {
            headline,
            body,
            certificateCta,
        };
    }, [t, subjectSlug, subjectFinish?.status, subjectFinish?.certificateIssued]);
}