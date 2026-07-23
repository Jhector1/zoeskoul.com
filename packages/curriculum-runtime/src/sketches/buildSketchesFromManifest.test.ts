import { describe, expect, it } from "vitest";
import { buildSketchesFromManifest } from "./buildSketchesFromManifest.js";

describe("buildSketchesFromManifest", () => {
  it("preserves algorithm animation steps and runtime metadata", () => {
    const sketches = buildSketchesFromManifest({
      subjectSlug: "c-data-structures",
      moduleSlug: "module-1",
      topicId: "priority-queue",
      runtimeDefaults: { kind: "code", language: "c" },
      sketches: [
        {
          id: "stack-animation",
          archetype: "algorithm_animation",
          titleKey: "topics.stack.title",
          contextKey: "topics.stack.context",
          intervalMs: 900,
          autoPlay: false,
          steps: [
            {
              id: "push",
              titleKey: "topics.stack.steps.push.title",
              bodyKey: "topics.stack.steps.push.body",
              formula: "T(n)=O(1)",
              code: "push(4)",
              nodes: [
                { id: "top", label: "4", x: 50, y: 25, active: true },
              ],
              edges: [],
            },
          ],
        },
      ],
    });

    expect(sketches).toEqual({
      "c-data-structures.module-1.priority-queue.stack-animation": {
        kind: "archetype",
        spec: {
          archetype: "algorithm_animation",
          specVersion: 1,
          title: "@:topics.stack.title",
          contextMarkdown: "@:topics.stack.context",
          steps: [
            {
              id: "push",
              title: "@:topics.stack.steps.push.title",
              bodyMarkdown: "@:topics.stack.steps.push.body",
              formula: "T(n)=O(1)",
              code: "push(4)",
              nodes: [
                { id: "top", label: "4", x: 50, y: 25, active: true },
              ],
            },
          ],
          intervalMs: 900,
          autoPlay: false,
          runtime: { kind: "code", language: "c" },
        },
      },
    });
  });
});
