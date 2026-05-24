import type { PublishGateResult } from "@zoeskoul/curriculum-contracts";
import { getProfileServices } from "@zoeskoul/curriculum-profiles";
import {
    readCourseQualityReport,
    readSubjectTopicReports,
} from "../reports/readTopicReports.js";

export async function buildPublishGateResult(args: {
    subjectSlug: string;
    profileId: string;
}): Promise<PublishGateResult> {
    const reports = await readSubjectTopicReports({
        subjectSlug: args.subjectSlug,
    });

    const policy = getProfileServices(args.profileId).getTrustPolicy();

    let repairsLow = 0;
    let repairsMedium = 0;
    let repairsHigh = 0;
    let critiqueErrors = 0;
    let critiqueWarnings = 0;
    let semanticFailures = 0;
    let goldenFailures = 0;
    let hintWarnings = 0;
    let sqlRunnerMissing = 0;
    let qualityBlockers = 0;
    let qualityErrors = 0;
    let qualityWarnings = 0;
    let qualityInfos = 0;

    for (const report of reports) {
        for (const repair of report.repairReport?.repairs ?? []) {
            if (repair.severity === "low") repairsLow += 1;
            if (repair.severity === "medium") repairsMedium += 1;
            if (repair.severity === "high") repairsHigh += 1;
        }

        for (const issue of report.critiqueReport?.issues ?? []) {
            if (issue.severity === "error") critiqueErrors += 1;
            if (issue.severity === "warn") critiqueWarnings += 1;
            if (issue.code === "HINT_VALIDATION_WARNING") hintWarnings += 1;
        }

        for (const issue of report.semanticReport?.issues ?? []) {
            if (issue.severity === "error") semanticFailures += 1;
            if (issue.code === "SQL_RUNNER_NOT_CONFIGURED") sqlRunnerMissing += 1;
        }

        for (const issue of report.goldenReport?.issues ?? []) {
            if (issue.severity === "error") goldenFailures += 1;
        }

        qualityBlockers += report.qualityReport?.severityCounts?.blocker ?? 0;
        qualityErrors += report.qualityReport?.severityCounts?.error ?? 0;
        qualityWarnings += report.qualityReport?.severityCounts?.warning ?? 0;
        qualityInfos += report.qualityReport?.severityCounts?.info ?? 0;
    }

    const courseQualityReport = await readCourseQualityReport({
        subjectSlug: args.subjectSlug,
    });

    if (courseQualityReport) {
        qualityBlockers = Math.max(
            qualityBlockers,
            courseQualityReport.severityCounts.blocker,
        );
        qualityErrors = Math.max(
            qualityErrors,
            courseQualityReport.severityCounts.error,
        );
        qualityWarnings = Math.max(
            qualityWarnings,
            courseQualityReport.severityCounts.warning,
        );
        qualityInfos = Math.max(
            qualityInfos,
            courseQualityReport.severityCounts.info,
        );
    }

    const reasons: string[] = [];

    if (reports.length === 0) {
        reasons.push(`No topic reports were found for subject "${args.subjectSlug}".`);
    }

    if (!policy.autoPublishEnabled) {
        reasons.push(`Auto-publish is disabled for profile "${args.profileId}".`);
    }

    if (sqlRunnerMissing > 0) {
        reasons.push(`SQL semantic runner is not configured for ${sqlRunnerMissing} exercise(s).`);
    }

    if (critiqueErrors > 0) {
        reasons.push(`Critique found ${critiqueErrors} error(s).`);
    }

    if (semanticFailures > 0) {
        reasons.push(`Semantic validation found ${semanticFailures} error(s).`);
    }

    if (goldenFailures > 0) {
        reasons.push(`Golden validation found ${goldenFailures} error(s).`);
    }

    if (qualityBlockers > 0) {
        reasons.push(`Curriculum quality report found ${qualityBlockers} blocker(s).`);
    }

    if (qualityErrors > 0) {
        reasons.push(`Curriculum quality report found ${qualityErrors} error(s).`);
    }

    if (repairsHigh > 0 && !policy.allowHighSeverityRepairs) {
        reasons.push(`Found ${repairsHigh} high-severity repair(s).`);
    }

    if (repairsMedium > policy.maxMediumRepairs) {
        reasons.push(
            `Found ${repairsMedium} medium-severity repair(s), allowed maximum is ${policy.maxMediumRepairs}.`,
        );
    }

    if (hintWarnings > policy.maxHintWarnings) {
        reasons.push(
            `Found ${hintWarnings} hint warning(s), allowed maximum is ${policy.maxHintWarnings}.`,
        );
    }

    return {
        ok: reasons.length === 0,
        subjectSlug: args.subjectSlug,
        profileId: args.profileId,
        reasons,
        stats: {
            topicsTotal: reports.length,
            critiqueErrors,
            critiqueWarnings,
            repairsLow,
            repairsMedium,
            repairsHigh,
            hintWarnings,
            semanticFailures,
            goldenFailures,
            qualityBlockers,
            qualityErrors,
            qualityWarnings,
            qualityInfos,
        },
    };
}
