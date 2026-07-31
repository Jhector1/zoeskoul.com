import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relativePath: string,
) {
  return readFileSync(
    resolve(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

function topLevelSelectors(
  css: string,
) {
  const selectors: string[] = [];
  let cursor = 0;
  let depth = 0;
  let selectorStart = 0;
  let quote: string | null = null;

  while (cursor < css.length) {
    const current = css[cursor];
    const next =
      css[cursor + 1] ?? "";

    if (quote) {
      if (current === "\\") {
        cursor += 2;
        continue;
      }

      if (current === quote) {
        quote = null;
      }

      cursor += 1;
      continue;
    }

    if (
      current === "\"" ||
      current === "'"
    ) {
      quote = current;
      cursor += 1;
      continue;
    }

    if (
      current === "/" &&
      next === "*"
    ) {
      const end =
        css.indexOf(
          "*/",
          cursor + 2,
        );

      cursor =
        end < 0
          ? css.length
          : end + 2;
      continue;
    }

    if (current === "{") {
      if (depth === 0) {
        const selector =
          css
            .slice(
              selectorStart,
              cursor,
            )
            .trim();

        if (
          selector &&
          !selector.startsWith("@")
        ) {
          selectors.push(
            selector
              .replace(
                /\s+/g,
                " ",
              )
              .replace(
                /\s*,\s*/g,
                ",",
              ),
          );
        }
      }

      depth += 1;
      cursor += 1;
      continue;
    }

    if (current === "}") {
      depth = Math.max(
        0,
        depth - 1,
      );

      if (depth === 0) {
        selectorStart =
          cursor + 1;
      }

      cursor += 1;
      continue;
    }

    cursor += 1;
  }

  return selectors;
}

const forbiddenRootSelectors =
  new Set([
    ":root",
    "html",
    "html.dark",
    "body",
    "html.dark body",
    "html,body",
    "html,html.dark",
    "body,html.dark body",
  ]);

describe(
  "student old-UI CSS parity",
  () => {
    it(
      "does not load the temporary Vite scaffold stylesheet",
      () => {
        expect(
          source("src/main.tsx"),
        ).not.toContain(
          "./styles.css",
        );
      },
    );

    it(
      "loads the exact old stylesheet after migration-only CSS",
      () => {
        const app =
          source("src/App.tsx");
        const cssImports =
          [
            ...app.matchAll(
              /import\s+["']([^"']+\.css)["'];/g,
            ),
          ].map(
            (match) => match[1],
          );

        expect(
          cssImports.at(-1),
        ).toBe(
          "./legacy-web/styles/globals.css",
        );
      },
    );

    it(
      "keeps embedded Try It additions locally scoped",
      () => {
        const css = source(
          "src/lessons/student-embedded-try-it-file-create.css",
        );

        expect(css).toContain(
          ".student-embedded-try-it-file-create",
        );

        expect(
          topLevelSelectors(css).some(
            (selector) =>
              forbiddenRootSelectors.has(
                selector,
              ),
          ),
        ).toBe(false);
      },
    );

    it(
      "does not let migration shell CSS own root typography",
      () => {
        const selectors = [
          ...topLevelSelectors(
            source("src/shell.css"),
          ),
          ...topLevelSelectors(
            source(
              "src/platform/platform-shell.css",
            ),
          ),
        ];

        expect(
          selectors.filter(
            (selector) =>
              forbiddenRootSelectors.has(
                selector,
              ),
          ),
        ).toEqual([]);

        const migrationCss = [
          source("src/shell.css"),
          source(
            "src/platform/platform-shell.css",
          ),
        ].join("\n");

        expect(
          migrationCss,
        ).not.toMatch(
          /font-family\s*:/,
        );
      },
    );

    it(
      "allows scoped dark-mode descendant selectors",
      () => {
        expect(
          topLevelSelectors(
            source(
              "src/platform/platform-shell.css",
            ),
          ),
        ).toContain(
          "html.dark .student-platform-main .student-page-description",
        );
      },
    );
  },
);
