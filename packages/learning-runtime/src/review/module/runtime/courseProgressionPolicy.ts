export type CourseModuleEntryPolicy = {
    progressionOpen: true;
    accessOpen: boolean;
    accessLocked: boolean;
};

/**
 * Course progression never locks the module entry itself. Every published
 * module may be opened so its first topic stays available. Billing/access
 * restrictions remain authoritative and are handled separately.
 */
export function getCourseModuleEntryPolicy(args: {
    unlockAll: boolean;
    accessOk: boolean;
}): CourseModuleEntryPolicy {
    const accessOpen = args.unlockAll || args.accessOk;

    return {
        progressionOpen: true,
        accessOpen,
        accessLocked: !accessOpen,
    };
}

/**
 * Inside a module, the first topic is always available. Later topics unlock
 * only after the immediately preceding topic is complete.
 */
export function isModuleTopicUnlocked(args: {
    topicIndex: number;
    previousTopicComplete: boolean;
    unlockAll: boolean;
}) {
    if (args.unlockAll) return true;
    if (args.topicIndex <= 0) return true;

    return args.previousTopicComplete;
}
