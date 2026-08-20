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
  "learner-facing exercise prompt",
  () => {
    it(
      "shows the authored prompt without duplicating the exercise title",
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

        expect(html).not.toContain(
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

        expect(html).not.toContain(
          "Call a square function",
        );
        expect(html).toContain(
          "Call the function and print its return value.",
        );
        expect(html).not.toContain(
          "Use one print call.",
        );
      },
    );

    it(
      "renders the prompt even when title and prompt are identical",
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
