import React from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "@/components/markdown/MathMarkdown",
  () => ({
    default: ({
      content,
      className,
    }: {
      content: string;
      className?: string;
    }) => (
      <div data-class={className}>
        {content}
      </div>
    ),
  }),
);

vi.mock("@student/i18n/tagged", () => ({
  useTaggedT: () => ({
    resolve: (
      value: string,
      _params?: unknown,
      fallback?: string,
    ) => value || fallback || "",
    raw: (
      _key: string,
      fallback?: string,
    ) => fallback || "",
  }),
}));

import {
  ExercisePrompt,
} from "./practice-kind-helper";

describe(
  "full learner-facing exercise prompt",
  () => {
    it(
      "shows both the authored title and prompt",
      () => {
        const html =
          renderToStaticMarkup(
            <ExercisePrompt
              exercise={{
                title:
                  "Define and call greet",
                prompt:
                  "Define the function before you call it.",
              }}
            />,
          );

        expect(html).toContain(
          "Define and call greet",
        );
        expect(html).toContain(
          "Define the function before you call it.",
        );
      },
    );

    it(
      "does not render source-check metadata",
      () => {
        const html =
          renderToStaticMarkup(
            <ExercisePrompt
              exercise={{
                title:
                  "Call a square function",
                prompt:
                  "Call the function and print its return value.",
                sourceChecks: [
                  {
                    message:
                      "Use one print call.",
                  },
                ],
              }}
            />,
          );

        expect(html).toContain(
          "Call a square function",
        );
        expect(html).not.toContain(
          "Use one print call.",
        );
      },
    );

    it(
      "does not duplicate identical title and prompt",
      () => {
        const html =
          renderToStaticMarkup(
            <ExercisePrompt
              exercise={{
                title: "Practice",
                prompt: "Practice",
              }}
            />,
          );

        expect(
          html.match(/Practice/g),
        ).toHaveLength(1);
      },
    );
  },
);
