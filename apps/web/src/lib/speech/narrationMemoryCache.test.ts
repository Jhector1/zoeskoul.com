import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    createBoundedAsyncCache,
} from "./narrationMemoryCache";

describe(
    "narration memory cache",
    () => {
        it(
            "reuses a successful value",
            async () => {
                const factory =
                    vi.fn(
                        async () =>
                            "audio-a",
                    );

                const cache =
                    createBoundedAsyncCache({
                        maxEntries: 4,
                        maxBytes: 100,
                        ttlMs: 1000,
                        sizeOf:
                            (value: string) =>
                                value.length,
                    });

                const first =
                    await cache
                        .getOrCreate(
                            "a",
                            factory,
                        );

                const second =
                    await cache
                        .getOrCreate(
                            "a",
                            factory,
                        );

                expect(first.status)
                    .toBe("miss");

                expect(second.status)
                    .toBe("hit");

                expect(second.value)
                    .toBe("audio-a");

                expect(factory)
                    .toHaveBeenCalledTimes(
                        1,
                    );
            },
        );

        it(
            "coalesces identical concurrent work",
            async () => {
                let resolve:
                    | ((value: string) => void)
                    | undefined;

                const pending =
                    new Promise<string>(
                        (done) => {
                            resolve = done;
                        },
                    );

                const factory =
                    vi.fn(
                        () => pending,
                    );

                const cache =
                    createBoundedAsyncCache({
                        maxEntries: 4,
                        maxBytes: 100,
                        ttlMs: 1000,
                        sizeOf:
                            (value: string) =>
                                value.length,
                    });

                const first =
                    cache.getOrCreate(
                        "same",
                        factory,
                    );

                const second =
                    cache.getOrCreate(
                        "same",
                        factory,
                    );

                resolve?.("audio");

                const [
                    a,
                    b,
                ] = await Promise.all([
                    first,
                    second,
                ]);

                expect(a.status)
                    .toBe("miss");

                expect(b.status)
                    .toBe("shared");

                expect(factory)
                    .toHaveBeenCalledTimes(
                        1,
                    );
            },
        );

        it(
            "expires values after ttl",
            async () => {
                let current = 100;

                const cache =
                    createBoundedAsyncCache({
                        maxEntries: 4,
                        maxBytes: 100,
                        ttlMs: 10,
                        sizeOf:
                            (value: string) =>
                                value.length,
                        now:
                            () => current,
                    });

                const factory =
                    vi.fn()
                        .mockResolvedValueOnce(
                            "first",
                        )
                        .mockResolvedValueOnce(
                            "second",
                        );

                await cache.getOrCreate(
                    "a",
                    factory,
                );

                current = 111;

                const next =
                    await cache
                        .getOrCreate(
                            "a",
                            factory,
                        );

                expect(next.status)
                    .toBe("miss");

                expect(next.value)
                    .toBe("second");
            },
        );

        it(
            "evicts least recently used entries",
            async () => {
                const cache =
                    createBoundedAsyncCache({
                        maxEntries: 2,
                        maxBytes: 100,
                        ttlMs: 1000,
                        sizeOf:
                            (value: string) =>
                                value.length,
                    });

                const create =
                    (value: string) =>
                        async () => value;

                await cache.getOrCreate(
                    "a",
                    create("A"),
                );

                await cache.getOrCreate(
                    "b",
                    create("B"),
                );

                await cache.getOrCreate(
                    "a",
                    create("unused"),
                );

                await cache.getOrCreate(
                    "c",
                    create("C"),
                );

                const bFactory =
                    vi.fn(
                        async () => "B2",
                    );

                const b =
                    await cache
                        .getOrCreate(
                            "b",
                            bFactory,
                        );

                expect(b.status)
                    .toBe("miss");

                expect(b.value)
                    .toBe("B2");
            },
        );

        it(
            "does not cache failures",
            async () => {
                const cache =
                    createBoundedAsyncCache({
                        maxEntries: 4,
                        maxBytes: 100,
                        ttlMs: 1000,
                        sizeOf:
                            (value: string) =>
                                value.length,
                    });

                await expect(
                    cache.getOrCreate(
                        "a",
                        async () => {
                            throw new Error(
                                "boom",
                            );
                        },
                    ),
                ).rejects.toThrow(
                    "boom",
                );

                const retry =
                    await cache
                        .getOrCreate(
                            "a",
                            async () =>
                                "recovered",
                        );

                expect(retry.status)
                    .toBe("miss");
            },
        );
    },
);
