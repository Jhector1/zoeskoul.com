export type SpeechFormat =
    | "mp3"
    | "wav"
    | "opus";

export type SpeakOpts = {
    locale?: string;
    voice?: string;
    format?: SpeechFormat;
    speed?: number;
    instructions?: string;
};
