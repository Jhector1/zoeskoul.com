import { describe, expect, it } from "vitest";
import type { ReviewModule } from "@/lib/subjects/types";
import { rebaseTutoringModuleToolPresentation } from "./sessionToolPresentation";

function moduleFixture(args: {
  id: string;
  topicTools?: Record<string, unknown> | null;
  cardTools?: Record<string, unknown> | null;
  exerciseTools?: Record<string, unknown> | null;
  markdown: string;
}): ReviewModule {
  const topic = {
    id: "loops",
    label: "Loops",
    meta: {
      ...(args.topicTools !== undefined ? { tools: args.topicTools } : {}),
      rawManifest: {
        topicId: "loops",
        cards: [
          {
            id: "reading",
            ...(args.cardTools !== undefined ? { tools: args.cardTools } : {}),
          },
        ],
        exercises: [
          {
            id: "trace-loop",
            kind: "code_input",
            ...(args.exerciseTools !== undefined
              ? { tools: args.exerciseTools }
              : {}),
          },
        ],
      },
    },
    cards: [
      {
        type: "text" as const,
        id: "reading",
        title: "Reading",
        markdown: args.markdown,
        ...(args.cardTools !== undefined ? { tools: args.cardTools } : {}),
      },
    ],
  };

  return {
    id: args.id,
    title: "Module",
    startPracticeSectionSlug: "section-1",
    topics: [topic],
    sections: [
      {
        id: "section-1",
        slug: "section-1",
        title: "Section",
        order: 1,
        topics: [topic],
      },
    ],
  } as ReviewModule;
}

describe("rebaseTutoringModuleToolPresentation", () => {
  it("updates inherited, card, and exercise tool policies without replacing frozen content", () => {
    const frozen = moduleFixture({
      id: "tutoring-session-module",
      markdown: "Frozen lesson text",
    });
    const current = moduleFixture({
      id: "source-module",
      topicTools: { defaultVisible: true, allowOpen: true },
      cardTools: { defaultVisible: false },
      exerciseTools: { defaultVisible: true, allowOpen: false },
      markdown: "New source lesson text",
    });

    const rebased = rebaseTutoringModuleToolPresentation({
      frozenModule: frozen,
      currentModule: current,
    });

    expect(rebased.id).toBe("tutoring-session-module");
    expect(rebased.topics[0]?.cards[0]).toMatchObject({
      markdown: "Frozen lesson text",
      tools: { defaultVisible: false },
    });
    expect(rebased.topics[0]?.meta?.tools).toEqual({
      defaultVisible: true,
      allowOpen: true,
    });
    expect(
      (rebased.topics[0]?.meta?.rawManifest as any)?.exercises?.[0]?.tools,
    ).toEqual({
      defaultVisible: true,
      allowOpen: false,
    });
    expect(rebased.sections?.[0]?.topics[0]).toBe(rebased.topics[0]);
  });

  it("removes stale presentation overrides that no longer exist in the source", () => {
    const frozen = moduleFixture({
      id: "tutoring-session-module",
      topicTools: { defaultVisible: true },
      cardTools: { defaultVisible: false },
      exerciseTools: { allowOpen: false },
      markdown: "Frozen lesson text",
    });
    const current = moduleFixture({
      id: "source-module",
      markdown: "Current lesson text",
    });

    const rebased = rebaseTutoringModuleToolPresentation({
      frozenModule: frozen,
      currentModule: current,
    });

    expect(rebased.topics[0]?.meta).not.toHaveProperty("tools");
    expect(rebased.topics[0]?.cards[0]).not.toHaveProperty("tools");
    expect(
      (rebased.topics[0]?.meta?.rawManifest as any)?.exercises?.[0],
    ).not.toHaveProperty("tools");
  });

  it("returns the frozen module unchanged when the source cannot be resolved", () => {
    const frozen = moduleFixture({
      id: "tutoring-session-module",
      markdown: "Frozen lesson text",
    });

    expect(
      rebaseTutoringModuleToolPresentation({
        frozenModule: frozen,
        currentModule: null,
      }),
    ).toBe(frozen);
  });
});
