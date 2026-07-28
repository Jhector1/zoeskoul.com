import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createLearningClient,
} from "./index";

describe("learning runtime launch client", () => {
  it("loads a target-scoped protected launch", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = new URL(String(input));

        expect(url.pathname).toBe(
          "/api/student/courses/python/modules/module-1/runtime",
        );
        expect(
          url.searchParams.get("targetId"),
        ).toBe("sketch-1");
        expect(
          url.searchParams.get("runtimeKind"),
        ).toBe("sketch");

        return Response.json({
          target: {
            version: 1,
            sectionSlug: "section-1",
            topicSlug: "topic-1",
            ownerCardId: "sketch-1",
            targetKind: "card",
            targetId: "sketch-1",
            runtimeKind: "sketch",
          },
          title: "Sketch",
          activity: {
            kind: "legacy_handoff",
            href:
              "/en/subjects/python/modules/module-1/learn",
            reason: "runtime_not_migrated",
          },
        });
      },
    );

    const client = createLearningClient({
      apiOrigin: "http://localhost:3000",
      fetchImpl: fetchImpl as never,
    });

    const result =
      await client.fetchRuntimeLaunch({
        subjectSlug: "python",
        moduleSlug: "module-1",
        target: {
          version: 1,
          sectionSlug: "section-1",
          topicSlug: "topic-1",
          ownerCardId: "sketch-1",
          targetKind: "card",
          targetId: "sketch-1",
          runtimeKind: "sketch",
        },
      });

    expect(result.activity.kind).toBe(
      "legacy_handoff",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects an invalid response", async () => {
    const client = createLearningClient({
      apiOrigin: "http://localhost:3000",
      fetchImpl: vi.fn(
        async () =>
          Response.json({
            solutionCode: "secret",
          }),
      ) as never,
    });

    await expect(
      client.fetchRuntimeLaunch({
        subjectSlug: "python",
        moduleSlug: "module-1",
        target: {
          version: 1,
          sectionSlug: "section-1",
          topicSlug: "topic-1",
          ownerCardId: "sketch-1",
          targetKind: "card",
          targetId: "sketch-1",
          runtimeKind: "sketch",
        },
      }),
    ).rejects.toThrow(
      "The runtime launch response was invalid.",
    );
  });
});
