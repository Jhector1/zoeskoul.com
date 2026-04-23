import type {
    CritiqueReport,
    RepairReport,
    SemanticValidationReport,
} from "./profileServices.js";

export function makeEmptyRepairReport(topicId: string): RepairReport {
    return {
        topicId,
        repairs: [],
    };
}

export function makeEmptyCritiqueReport(topicId: string): CritiqueReport {
    return {
        topicId,
        ok: true,
        issues: [],
    };
}

export function makeEmptySemanticValidationReport(
    topicId: string,
): SemanticValidationReport {
    return {
        topicId,
        ok: true,
        issues: [],
    };
}