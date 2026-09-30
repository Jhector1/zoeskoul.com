import {
    claimLanguageAudioSession,
    createLanguageAudioSessionOwner,
    isLanguageAudioSessionOwnerActive,
    releaseLanguageAudioSession,
    resetLanguageAudioSessionForTests,
    stopActiveLanguageAudioSession,
} from "./languageAudioSession";

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

afterEach(() => {
    resetLanguageAudioSessionForTests();
});

describe("language audio session ownership", () => {
    it("atomically stops the previous player when navigation claims a new owner", () => {
        const first = createLanguageAudioSessionOwner();
        const second = createLanguageAudioSessionOwner();
        const stopFirst = vi.fn();
        const stopSecond = vi.fn();

        claimLanguageAudioSession(first, stopFirst);
        claimLanguageAudioSession(second, stopSecond);

        expect(stopFirst).toHaveBeenCalledTimes(1);
        expect(stopSecond).not.toHaveBeenCalled();
        expect(isLanguageAudioSessionOwnerActive(first)).toBe(false);
        expect(isLanguageAudioSessionOwnerActive(second)).toBe(true);
    });

    it("does not let an outgoing card release the incoming card's session", () => {
        const first = createLanguageAudioSessionOwner();
        const second = createLanguageAudioSessionOwner();

        claimLanguageAudioSession(first, () => undefined);
        claimLanguageAudioSession(second, () => undefined);
        releaseLanguageAudioSession(first);

        expect(isLanguageAudioSessionOwnerActive(second)).toBe(true);
    });

    it("stops the currently active narration exactly once", () => {
        const owner = createLanguageAudioSessionOwner();
        const stop = vi.fn();

        claimLanguageAudioSession(owner, stop);
        stopActiveLanguageAudioSession();

        expect(stop).toHaveBeenCalledTimes(1);
        expect(isLanguageAudioSessionOwnerActive(owner)).toBe(false);
    });
});
