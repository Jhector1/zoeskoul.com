export type FinalCertificateCtaState = {
    navLoading: boolean;
    navError: unknown;
    nextModuleId: string | null;
    nextTopicId: string | null;
    activeCardIndex: number;
    cardCount: number;
    topicComplete: boolean;
    atEndOfPublishedTrack: boolean;
};

/**
 * The certificate is the destination after the final completed learner card,
 * not a replacement for card-level or exercise-level Next navigation.
 */
export function shouldShowFinalCertificateCta(
    state: FinalCertificateCtaState,
): boolean {
    if (state.navLoading || Boolean(state.navError)) return false;
    if (!state.atEndOfPublishedTrack) return false;
    if (state.nextModuleId || state.nextTopicId) return false;
    if (!state.topicComplete || state.cardCount <= 0) return false;

    return state.activeCardIndex === state.cardCount - 1;
}
