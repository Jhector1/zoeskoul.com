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

function source(relative: string) {
  return readFileSync(
    resolve(__dirname, "../../..", relative),
    "utf8",
  );
}

describe(
  "ZoeBuild warm preview and locale-root routing",
  () => {
    const shell = source(
      "src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
    );

    it(
      "keeps the project Preview surface mounted while Code or Site Settings is active",
      () => {
        expect(shell).toContain(
          'className="zb-project-preview-stage"',
        );
        expect(shell).toContain(
          'hidden={settingsOpen || mode !== "preview"}',
        );
        expect(shell).toContain(
          'aria-hidden={settingsOpen || mode !== "preview"}',
        );
        expect(shell).not.toContain(
          '{!settingsOpen &&\n        mode === "preview" ? (',
        );
        expect(shell).toContain(
          "enabled: reactPreviewEnabled,",
        );
        expect(shell).not.toContain(
          "enabled: reactPreviewEnabled &&",
        );
      },
    );

    it(
      "keeps the existing Code workspace mounted too",
      () => {
        expect(shell).toContain(
          'hidden={settingsOpen || mode !== "code"}',
        );
      },
    );

    it(
      "routes the project escape hatch to the current locale Projects page",
      () => {
        expect(shell).toContain(
          'href={`/${encodeURIComponent(props.locale)}/projects`}',
        );
        expect(shell).not.toContain(
          'href=".."',
        );

        const detail = source(
          "src/app/[locale]/projects/[buildProjectId]/page.tsx",
        );
        expect(detail).toContain(
          "locale={locale}",
        );
      },
    );

    it(
      "makes supported locale roots valid and redirects them to Projects",
      () => {
        const root = source(
          "src/app/[locale]/page.tsx",
        );

        expect(root).toContain(
          'from "@zoeskoul/app-config"',
        );
        expect(root).toContain(
          "supportedLocales.some(",
        );
        expect(root).toContain(
          "notFound();",
        );
        expect(root).toContain(
          "redirect(`/${locale}/projects`);",
        );
      },
    );
  },
);
