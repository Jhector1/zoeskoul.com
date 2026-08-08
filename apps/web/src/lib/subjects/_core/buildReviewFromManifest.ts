import { buildReviewFromManifest as buildSharedReviewFromManifest } from "@zoeskoul/curriculum-runtime/compat/buildReviewFromManifest";
import { tag } from "@/lib/practice/generator/shared/i18n";

export function buildReviewFromManifest(
    args: Parameters<typeof buildSharedReviewFromManifest>[0],
) {
    return buildSharedReviewFromManifest({
        ...args,
        resolveText: tag,
    });
}
