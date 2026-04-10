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

        const runtime = sketch.runtime ?? manifest.runtimeDefaults ?? null;

        if (sketch.archetype === "image") {
            const entry: SketchEntry = {
                kind: "archetype",
                spec: {
                    archetype: "image",
                    specVersion: 1,
                    title: `@:${sketch.titleKey}`,
                    src: sketch.src ?? (sketch.publicId ? optimizer(sketch.publicId) : ""),
                    ...(sketch.altKey ? { alt: `@:${sketch.altKey}` } : {}),
                    ...(sketch.captionKey ? { caption: `@:${sketch.captionKey}` } : {}),
                    ...(sketch.aspectRatio != null ? { aspectRatio: sketch.aspectRatio } : {}),
                    ...(sketch.markers?.length
                        ? {
                            markers: sketch.markers.map((m) => ({
                                id: m.id,
                                x: m.x,
                                y: m.y,
                                label: `@:${m.labelKey}`,
                            })),
                        }
                        : {}),
                    ...(sketch.initialZoom != null ? { initialZoom: sketch.initialZoom } : {}),
                    ...(sketch.minZoom != null ? { minZoom: sketch.minZoom } : {}),
                    ...(sketch.maxZoom != null ? { maxZoom: sketch.maxZoom } : {}),
                    ...(sketch.zoomStep != null ? { zoomStep: sketch.zoomStep } : {}),
                    ...(sketch.allowPan != null ? { allowPan: sketch.allowPan } : {}),
                    ...(sketch.allowWheelZoom != null ? { allowWheelZoom: sketch.allowWheelZoom } : {}),
                    ...(sketch.allowDoubleClickReset != null
                        ? { allowDoubleClickReset: sketch.allowDoubleClickReset }
                        : {}),
                    ...(sketch.showControls != null ? { showControls: sketch.showControls } : {}),
                    ...(runtime ? { runtime } : {}),
                },
            };

            return [sketchId, entry];
        }

        const entry: SketchEntry = {
            kind: "archetype",
            spec: {
                archetype: "paragraph",
                specVersion: 2,
                title: `@:${sketch.titleKey}`,
                bodyMarkdown: `@:${sketch.bodyKey}`,
                ...(runtime ? { runtime } : {}),
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