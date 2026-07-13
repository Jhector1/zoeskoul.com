export const CERTIFICATE_DESIGN_WIDTH = 820;
export const CERTIFICATE_DESIGN_HEIGHT = CERTIFICATE_DESIGN_WIDTH / (11 / 8.5);

export const CERTIFICATE_COLORS = {
    paper: "#FFFFFF",
    ink: "#0B1220",
    sub: "#334155",
    muted: "#64748B",
    line: "#D8DEE9",
    gold: "#C9A227",
    goldDark: "#B88B1D",
    sealFill: "#FFF8E1",
    wave: "#CBD5E1",
} as const;

export const CERTIFICATE_LAYOUT = {
    outerFrameInsetPx: 18,
    outerFrameRadiusPx: 16,
    outerFrameWidthPx: 3,
    innerFrameInsetPx: 34,
    innerFrameRadiusPx: 14,
    cornerInsetPx: 22,
    cornerSizePx: 12,

    waveLeftPct: 3.5,
    waveRightPct: 3.5,
    waveStartTopPct: 11,
    waveStepPct: 6.1,
    waveCount: 12,
    waveSkewDeg: 3,
    waveOpacity: 0.18,

    watermarkRotationDeg: -12,
    watermarkTrackingEm: 0.14,
    watermarkOpacity: 0.06,

    headerTopPct: 8.7,
    headerWidthPct: 72,

    titleTopPct: 19,
    titleWidthPct: 76,
    titleSubtitleGapPx: 8,

    separatorTopPct: 34.2,
    separatorWidthPct: 24,
    separatorHeightPx: 2,

    presentedTopPct: 38.6,
    learnerTopPct: 43.2,
    learnerLineTopPct: 56.2,
    learnerLineWidthPct: 50,

    completionTopPct: 59.3,
    subjectTopPct: 63.2,

    footerTopPct: 76.2,
    footerSidePct: 13.2,
    footerColumnWidthPct: 24.4,

    sealTopPct: 74.8,
    sealSizePx: 76,

    footerDividerTopPct: 89.2,
    footerDividerSidePct: 8.8,
    disclaimerTopPct: 90.6,
    disclaimerWidthPct: 73,
    metaBottomPct: 5.4,
    metaSidePct: 6.6,
    metaMaxWidthPct: 42,
} as const;

export const CERTIFICATE_TYPE = {
    appPx: 11,
    appTrackingEm: 0.22,
    headerSubjectPx: 12,
    titlePx: 55.2,
    titleCss: "clamp(2.6rem,5.2vw,3.45rem)",
    subtitlePx: 22.4,
    subtitleCss: "clamp(1.05rem,2vw,1.4rem)",
    bodyPx: 13,
    learnerPx: 56,
    learnerCss: "clamp(2rem,5.6vw,3.5rem)",
    subjectPx: 25.6,
    subjectCss: "clamp(1rem,2.2vw,1.6rem)",
    footerValuePx: 11,
    footerLabelPx: 10,
    sealTitlePx: 9,
    sealBrandPx: 7,
    disclaimerPx: 7.5,
    metaPx: 9,
    watermarkPx: 88,
    watermarkCss: "clamp(3rem,8vw,5.5rem)",
} as const;
