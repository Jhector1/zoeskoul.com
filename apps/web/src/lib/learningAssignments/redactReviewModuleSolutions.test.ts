import { describe, expect, it } from "vitest";
import { redactReviewModuleSolutions } from "./redactReviewModuleSolutions";

it("removes nested code solutions and reveal flags without changing starter files", () => {
  const module = {
    id: "m1",
    title: "Private course",
    startPracticeSectionSlug: "s1",
    topics: [
      {
        id: "t1",
        label: "Topic",
        cards: [
          {
            type: "project",
            id: "p1",
            spec: {
              mode: "project",
              subject: "c",
              allowReveal: true,
              steps: [
                {
                  id: "step",
                  starterFiles: [{ path: "main.c", content: "// TODO" }],
                  solutionCode: "done",
                  solutionFiles: [{ path: "main.c", content: "done" }],
                },
              ],
            },
          },
        ],
      },
    ],
  } as any;

  const redacted = redactReviewModuleSolutions(module) as any;
  expect(redacted.topics[0].cards[0].spec.allowReveal).toBe(false);
  expect(redacted.topics[0].cards[0].spec.steps[0].solutionCode).toBeUndefined();
  expect(redacted.topics[0].cards[0].spec.steps[0].solutionFiles).toBeUndefined();
  expect(redacted.topics[0].cards[0].spec.steps[0].starterFiles).toHaveLength(1);
});
