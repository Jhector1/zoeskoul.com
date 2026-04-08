import "server-only";

import type { Values } from "@/i18n/tagged";
import { resolveDeepTagged, type DeepResolved } from "@/i18n/resolveDeepTagged";
import {getServerI18n} from "@/i18n/server";

export async function resolveTaggedOnServer<T>(
    input: T,
    namespace?: string,
    values?: Values,
): Promise<DeepResolved<T>> {
    const { tMaybe } = await getServerI18n(namespace);

    return resolveDeepTagged(
        input,
        (key, v) =>
            tMaybe(key, `@:${key}`, v as Record<string, unknown> | undefined),
        values,
    ) as DeepResolved<T>;
}