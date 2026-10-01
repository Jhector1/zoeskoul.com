import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    prepareLanguageNarration,
    resetLanguageNarrationPreparationForTests,
} from "./languageAudioPreparation";

afterEach(() => {
    resetLanguageNarrationPreparationForTests();
    vi.unstubAllGlobals();
});

describe(
    "language narration preparation",
    () => {
        it(
            "shares one browser request between concurrent preparation consumers",
            async () => {
                const buffer =
                    new Uint8Array([
                        1,
                        2,
                        3,
                    ]).buffer;

                let resolveFetch:
                    (
                        value:
                            Response,
                    ) => void =
                    () => undefined;

                const fetchMock =
                    vi.fn(
                        () =>
                            new Promise<Response>(
                                (
                                    resolve,
                                ) => {
                                    resolveFetch =
                                        resolve;
                                },
                            ),
                    );

                vi.stubGlobal(
                    "fetch",
                    fetchMock,
                );

                const sequence = [
                    {
                        text:
                            "Bonjou",
                        opts: {
                            locale:
                                "ht-HT",
                            voice:
                                "marin",
                            speed:
                                1,
                            instructions:
                                "Speak naturally.",
                        },
                        pauseMs:
                            250,
                    },
                ];

                const first =
                    prepareLanguageNarration(
                        sequence,
                    );

                const second =
                    prepareLanguageNarration(
                        sequence,
                    );

                expect(
                    fetchMock,
                ).toHaveBeenCalledTimes(
                    1,
                );

                const request =
                    fetchMock.mock
                        .calls[0]?.[1] as
                        RequestInit;

                expect(
                    JSON.parse(
                        String(
                            request.body,
                        ),
                    ),
                ).toEqual({
                    segments: [
                        {
                            text:
                                "Bonjou",
                            locale:
                                "ht-HT",
                            voice:
                                "marin",
                            speed:
                                1,
                            instructions:
                                "Speak naturally.",
                            pauseMs:
                                250,
                        },
                    ],
                });

                resolveFetch(
                    {
                        ok: true,
                        headers: {
                            get: () =>
                                "audio/wav",
                        },
                        arrayBuffer:
                            async () =>
                                buffer,
                    } as unknown as Response,
                );

                const [
                    preparedA,
                    preparedB,
                ] =
                    await Promise.all([
                        first,
                        second,
                    ]);

                expect(
                    preparedA?.buffer,
                ).toBe(buffer);

                expect(
                    preparedB?.buffer,
                ).toBe(buffer);

                await prepareLanguageNarration(
                    sequence,
                );

                expect(
                    fetchMock,
                ).toHaveBeenCalledTimes(
                    1,
                );
            },
        );

        it(
            "does not poison the cache after a failed preparation",
            async () => {
                const buffer =
                    new Uint8Array([
                        4,
                        5,
                        6,
                    ]).buffer;

                const fetchMock =
                    vi.fn()
                        .mockResolvedValueOnce(
                            {
                                ok: false,
                                json:
                                    async () => ({
                                        message:
                                            "temporary failure",
                                    }),
                            } as Response,
                        )
                        .mockResolvedValueOnce(
                            {
                                ok: true,
                                headers: {
                                    get:
                                        () =>
                                            "audio/wav",
                                },
                                arrayBuffer:
                                    async () =>
                                        buffer,
                            } as unknown as Response,
                        );

                vi.stubGlobal(
                    "fetch",
                    fetchMock,
                );

                const sequence = [
                    {
                        text:
                            "Mèsi",
                        opts: {
                            locale:
                                "ht-HT",
                        },
                    },
                ];

                await expect(
                    prepareLanguageNarration(
                        sequence,
                    ),
                ).rejects.toThrow(
                    "temporary failure",
                );

                const prepared =
                    await prepareLanguageNarration(
                        sequence,
                    );

                expect(
                    prepared?.buffer,
                ).toBe(buffer);

                expect(
                    fetchMock,
                ).toHaveBeenCalledTimes(
                    2,
                );
            },
        );
    },
);
