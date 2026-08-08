import "server-only";

import type { Values } from "@zoeskoul/i18n-core";
import { resolveDeepTagged, type DeepResolved } from "@zoeskoul/i18n-core";
import { getServerI18n } from "@/i18n/server";

export async function resolveTaggedOnServer<T>(
    input: T,
    namespace?: string,
    values?: Values,
): Promise<DeepResolved<T>> {
    const { rawMaybe, tMaybe } = await getServerI18n(namespace);

    return resolveDeepTagged(
        input,
        (key, v) => {
            const taggedFallback = `@:${key}`;
            const resolvedValues = v as Record<string, unknown> | undefined;

            if (!resolvedValues) {
                return rawMaybe<string>(key, taggedFallback);
            }

            return tMaybe(key, taggedFallback, resolvedValues);
        },
        values,
    ) as DeepResolved<T>;
}
