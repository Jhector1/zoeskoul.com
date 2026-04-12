const LEVEL_THRESHOLDS = [
    0,
    100,
    250,
    450,
    700,
    1000,
    1400,
    1900,
    2500,
    3200,
] as const;

export function getLevelForXp(totalXp: number): number {
    const xp = Math.max(0, totalXp);

    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
        else break;
    }

    if (xp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) {
        const overflow = xp - LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
        return LEVEL_THRESHOLDS.length + Math.floor(overflow / 1000);
    }

    return level;
}

export function getXpFloorForLevel(level: number): number {
    if (level <= 1) return 0;
    if (level <= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level - 1];

    const base = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const extraLevels = level - LEVEL_THRESHOLDS.length;
    return base + extraLevels * 1000;
}

export function getXpRequiredForNextLevel(level: number): number | null {
    if (level < LEVEL_THRESHOLDS.length) {
        return LEVEL_THRESHOLDS[level];
    }

    const base = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const extraLevels = level - LEVEL_THRESHOLDS.length + 1;
    return base + extraLevels * 1000;
}

export function getLevelProgress(totalXp: number) {
    const level = getLevelForXp(totalXp);
    const floor = getXpFloorForLevel(level);
    const next = getXpRequiredForNextLevel(level);

    if (next == null) {
        return {
            level,
            xpIntoLevel: Math.max(0, totalXp - floor),
            xpForNextLevel: null,
            levelProgressPct: 100,
        };
    }

    const span = Math.max(1, next - floor);
    const xpIntoLevel = Math.max(0, totalXp - floor);

    return {
        level,
        xpIntoLevel,
        xpForNextLevel: span,
        levelProgressPct: Math.max(0, Math.min(100, Math.round((xpIntoLevel / span) * 100))),
    };
}