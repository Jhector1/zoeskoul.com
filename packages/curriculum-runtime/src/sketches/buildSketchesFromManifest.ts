function cloudinaryImageUrl(imagePublicId: string) {
  return `https://res.cloudinary.com/demo/image/upload/${imagePublicId}`;
}

export function buildSketchesFromManifest(manifest: any): Record<string, any> {
  const entries: Array<[string, any]> = manifest.sketches.map((sketch: any) => {
    const sketchId = `${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.${sketch.id}`;
    const runtime = sketch.runtime ?? manifest.runtimeDefaults ?? null;

    if (sketch.archetype === "algorithm_animation") {
      return [
        sketchId,
        {
          kind: "archetype",
          spec: {
            archetype: "algorithm_animation",
            specVersion: 1,
            title: `@:${sketch.titleKey}`,
            ...(sketch.contextKey ? { contextMarkdown: `@:${sketch.contextKey}` } : {}),
            steps: sketch.steps.map((step: any) => ({
              id: step.id,
              title: `@:${step.titleKey}`,
              ...(step.bodyKey ? { bodyMarkdown: `@:${step.bodyKey}` } : {}),
              ...(step.formula ? { formula: step.formula } : {}),
              ...(step.code ? { code: step.code } : {}),
              nodes: step.nodes.map((node: any) => ({ ...node })),
              ...(step.edges?.length
                ? { edges: step.edges.map((edge: any) => ({ ...edge })) }
                : {}),
            })),
            ...(sketch.intervalMs != null ? { intervalMs: sketch.intervalMs } : {}),
            ...(sketch.autoPlay != null ? { autoPlay: sketch.autoPlay } : {}),
            ...(sketch.showControls != null ? { showControls: sketch.showControls } : {}),
            ...(sketch.showStepCounter != null
              ? { showStepCounter: sketch.showStepCounter }
              : {}),
            ...(sketch.canvasHeight != null ? { canvasHeight: sketch.canvasHeight } : {}),
            ...(runtime ? { runtime } : {}),
          },
        },
      ];
    }

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
        },
      },
    ];
  });

  return Object.fromEntries(entries);
}
