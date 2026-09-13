export type ReviewContentVersion = {
    kind: "review_content_patch";
    subjectSlug: string;
    moduleSlug: string;
    contentReleaseId: string;
    subjectContentHash: string;
    moduleContentHash: string;
    generatedAt: string | null;

    /**
     * This is product/course-track version.
     * Do not use this for the refresh banner.
     */
    courseTrackVersion: number | null;
};