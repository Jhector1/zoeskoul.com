export type LanguageAudioSessionOwner = symbol;

type ActiveLanguageAudioSession = {
    owner: LanguageAudioSessionOwner;
    stop: () => void;
};

let activeSession: ActiveLanguageAudioSession | null = null;

export function createLanguageAudioSessionOwner(): LanguageAudioSessionOwner {
    return Symbol("zoeskoul-language-audio");
}

export function claimLanguageAudioSession(
    owner: LanguageAudioSessionOwner,
    stop: () => void,
) {
    const previous = activeSession;

    activeSession = {
        owner,
        stop,
    };

    if (previous && previous.owner !== owner) {
        previous.stop();
    }
}

export function releaseLanguageAudioSession(owner: LanguageAudioSessionOwner) {
    if (activeSession?.owner === owner) {
        activeSession = null;
    }
}

export function stopActiveLanguageAudioSession() {
    const previous = activeSession;
    activeSession = null;
    previous?.stop();
}

export function isLanguageAudioSessionOwnerActive(
    owner: LanguageAudioSessionOwner,
) {
    return activeSession?.owner === owner;
}

export function resetLanguageAudioSessionForTests() {
    activeSession = null;
}
