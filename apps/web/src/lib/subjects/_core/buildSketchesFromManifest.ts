import type { TopicBundleManifest } from "./manifestTypes";
import type { SketchEntry } from "@/components/sketches/subjects";
import { cloudinaryImageUrl } from "@/lib/cloudinary/url";

const optimizer = (imagePublicId: string) =>
    cloudinaryImageUrl(imagePublicId, {});

export function buildSketchesFromManifest(
    manifest: TopicBundleManifest,
): Record<string, SketchEntry> {
    const entries: Array<[string, SketchEntry]> = manifest.sketches.map((sketch) => {
        const sketchId =
            `${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.${sketch.id}`;

        const entry: SketchEntry = {
            kind: "archetype",
            spec: {
                archetype: sketch.archetype,
                specVersion: 2,
                title: `@:${sketch.titleKey}`,
                bodyMarkdown: `@:${sketch.bodyKey}`,
                ...(sketch.images?.length
                    ? {
                        images: Object.fromEntries(
                            sketch.images.map((img) => [
                                img.id,
                                {
                                    src: optimizer(img.publicId),
                                    alt: img.alt ?? "",
                                    ...(img.width != null ? { width: img.width } : {}),
                                    ...(img.height != null ? { height: img.height } : {}),
                                },
                            ]),
                        ),
                    }
                    : {}),
            },
        };

        return [sketchId, entry];
    });

    return Object.fromEntries(entries);
}