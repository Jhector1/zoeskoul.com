import { PROGRESS_RANGE_IDS, type ProgressRangeId } from "@zoeskoul/progress-contracts";

export function firstParam(value: unknown) {
    return Array.isArray(value) ? value[0] : value;
}

export function daysForRange(range: ProgressRangeId) {
    if (range === "7d") return 7;
    if (range === "90d") return 90;
    return 30;
}

export function startOfDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

export function rangeStart(range: ProgressRangeId) {
    const date = new Date();
    date.setDate(date.getDate() - daysForRange(range));
    return startOfDay(date);
}

export function toIso(value: Date | null | undefined) {
    return value ? value.toISOString() : null;
}

export function formatTopicLabel(args: {
    slug?: string | null;
    titleKey?: string | null;
}) {
    if (args.slug) {
        return args.slug
            .split(/[-_]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    if (args.titleKey) {
        return args.titleKey;
    }

    return null;
}

export function buildLearnerDetailHref(actorKey: string) {
    return `/admin/learners/${encodeURIComponent(actorKey)}`;
}

export { PROGRESS_RANGE_IDS };
