export type AsyncCacheStatus =
    | "hit"
    | "miss"
    | "shared";

type CacheEntry<T> = {
    value: T;
    expiresAt: number;
    bytes: number;
};

export type BoundedAsyncCacheOptions<T> = {
    maxEntries: number;
    maxBytes: number;
    ttlMs: number;
    sizeOf: (value: T) => number;
    now?: () => number;
};

export function createBoundedAsyncCache<T>(
    options: BoundedAsyncCacheOptions<T>,
) {
    const entries =
        new Map<string, CacheEntry<T>>();

    const inFlight =
        new Map<string, Promise<T>>();

    const now =
        options.now ??
        (() => Date.now());

    let totalBytes = 0;

    function remove(key: string) {
        const existing =
            entries.get(key);

        if (!existing) {
            return;
        }

        totalBytes -=
            existing.bytes;

        entries.delete(key);
    }

    function pruneExpired() {
        const at = now();

        for (const [
            key,
            entry,
        ] of entries) {
            if (
                entry.expiresAt <= at
            ) {
                remove(key);
            }
        }
    }

    function read(key: string):
        | T
        | null {
        pruneExpired();

        const entry =
            entries.get(key);

        if (!entry) {
            return null;
        }

        entries.delete(key);
        entries.set(key, entry);

        return entry.value;
    }

    function write(
        key: string,
        value: T,
    ) {
        const bytes =
            Math.max(
                0,
                Math.floor(
                    options.sizeOf(
                        value,
                    ),
                ),
            );

        if (
            bytes >
            options.maxBytes
        ) {
            return;
        }

        remove(key);

        entries.set(key, {
            value,
            bytes,
            expiresAt:
                now() +
                options.ttlMs,
        });

        totalBytes += bytes;

        while (
            entries.size >
                options.maxEntries ||
            totalBytes >
                options.maxBytes
        ) {
            const oldest =
                entries.keys().next()
                    .value as
                    | string
                    | undefined;

            if (oldest == null) {
                break;
            }

            remove(oldest);
        }
    }

    async function getOrCreate(
        key: string,
        factory: () => Promise<T>,
    ): Promise<{
        value: T;
        status: AsyncCacheStatus;
    }> {
        const cached = read(key);

        if (cached != null) {
            return {
                value: cached,
                status: "hit",
            };
        }

        const shared =
            inFlight.get(key);

        if (shared) {
            return {
                value:
                    await shared,
                status: "shared",
            };
        }

        const pending =
            factory()
                .then((value) => {
                    write(key, value);
                    return value;
                })
                .finally(() => {
                    if (
                        inFlight.get(
                            key,
                        ) === pending
                    ) {
                        inFlight.delete(
                            key,
                        );
                    }
                });

        inFlight.set(
            key,
            pending,
        );

        return {
            value:
                await pending,
            status: "miss",
        };
    }

    return {
        getOrCreate,

        clear() {
            entries.clear();
            inFlight.clear();
            totalBytes = 0;
        },

        stats() {
            pruneExpired();

            return {
                entries:
                    entries.size,
                inFlight:
                    inFlight.size,
                totalBytes,
            };
        },
    };
}
