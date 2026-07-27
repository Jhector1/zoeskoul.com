import {
  createElement,
} from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  LessonMarkdown,
  parseTerminalExample,
  safeMarkdownUrl,
  shouldRenderLiteralOperatorContent,
} from "./index";

describe("lesson renderer contracts", () => {
  it.each([
    ">",
    ">>",
    "..",
    "~",
    "&&",
    "||",
    "<=",
    ">=",
    "!=",
    "+",
    "-",
  ])(
    "renders %s as a literal operator",
    (value) => {
      expect(
        shouldRenderLiteralOperatorContent(
          value,
        ),
      ).toBe(true);
    },
  );

  it("allows only learner-safe link protocols", () => {
    expect(
      safeMarkdownUrl(
        "https://example.com/lesson",
      ),
    ).toBe("https://example.com/lesson");
    expect(
      safeMarkdownUrl("/courses/python"),
    ).toBe("/courses/python");
    expect(
      safeMarkdownUrl("images/diagram.png"),
    ).toBe("images/diagram.png");
    expect(
      safeMarkdownUrl("//untrusted.example"),
    ).toBe("");
    expect(
      safeMarkdownUrl(
        "javascript:alert(1)",
      ),
    ).toBe("");
    expect(
      safeMarkdownUrl(
        "data:text/html,unsafe",
      ),
    ).toBe("");
  });

  it("parses terminal metadata and line roles", () => {
    expect(
      parseTerminalExample(
        "@meta Accepted | Python\n$ python app.py\nDone",
      ),
    ).toEqual({
      meta: "Accepted • Python",
      status: "accepted",
      lines: [
        {
          text: "$ python app.py",
          kind: "system",
        },
        {
          text: "Done",
          kind: "output",
        },
      ],
    });
  });

  it("renders headings, safe external links, math, and code tools", () => {
    const html = renderToStaticMarkup(
      createElement(LessonMarkdown, {
        content: [
          "# Heading",
          "",
          "[Docs](https://example.com/docs)",
          "",
          "$$x^2$$",
          "",
          "```python",
          "print('hello')",
          "```",
        ].join("\n"),
      }),
    );

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain(
      'rel="noopener noreferrer"',
    );
    expect(html).toContain("katex");
    expect(html).toContain(
      "zoe-code-language",
    );
    expect(html).toContain("Python");
    expect(html).toContain(
      'aria-label="Copy code"',
    );
  });

  it("does not render authored raw HTML", () => {
    const html = renderToStaticMarkup(
      createElement(LessonMarkdown, {
        content:
          "<script>alert('unsafe')</script>",
      }),
    );

    expect(html).not.toContain("<script>");
  });
});
