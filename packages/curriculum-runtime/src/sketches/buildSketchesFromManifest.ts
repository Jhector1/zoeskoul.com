function cloudinaryImageUrl(imagePublicId: string) {
    return `https://res.cloudinary.com/demo/image/upload/${imagePublicId}`;
}

export function buildSketchesFromManifest(manifest: any): Record<string, any> {
    const entries: Array<[string, any]> = manifest.sketches.map((sketch: any) => {
        const sketchId = `${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.${sketch.id}`;
        const runtime = sketch.runtime ?? manifest.runtimeDefaults ?? null;

        if (sketch.archetype === "image") {
            return [
                sketchId,
                {
                    kind: "archetype",
                    spec: {
                        archetype: "image",
                        specVersion: 1,
                        title: `@:${sketch.titleKey}`,
                        src: sketch.src ?? (sketch.publicId ? cloudinaryImageUrl(sketch.publicId) : ""),
                        ...(sketch.altKey ? { alt: `@:${sketch.altKey}` } : {}),
                        ...(sketch.captionKey ? { caption: `@:${sketch.captionKey}` } : {}),
                        ...(sketch.aspectRatio != null ? { aspectRatio: sketch.aspectRatio } : {}),
                        ...(runtime ? { runtime } : {}),
                    },
                },
            ];
        }

        return [
            sketchId,
            {
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
                                sketch.images.map((img: any) => [
                                    img.id,
                                    {
                                        src: cloudinaryImageUrl(img.publicId),
                                        alt: img.alt ?? "",
                                        ...(img.width != null ? { width: img.width } : {}),
                                        ...(img.height != null ? { height: img.height } : {}),
                                    },
                                ]),
                            ),
                        }
                        : {}),
                },
            },
        ];
    });

    return Object.fromEntries(entries);
}