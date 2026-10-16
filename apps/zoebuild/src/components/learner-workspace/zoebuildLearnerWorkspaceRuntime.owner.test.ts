import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";

import {
  describe,
  expect,
  it,
} from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(relativeUrl, import.meta.url),
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild learner-workspace runtime ownership",
  () => {
    it(
      "installs an app-local runtime around canonical learner-workspace UI",
      () => {
        const runtime = source(
          "./ZoeBuildLearnerWorkspaceRuntime.tsx",
        );
        const providers = source(
          "../../app/providers.tsx",
        );
        const workspace = source(
          "../../app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx",
        );

        expect(runtime).toContain(
          "LearnerWorkspaceRuntimeProvider",
        );
        expect(runtime).toContain(
          "setLearnerWorkspaceStaticConfig",
        );
        expect(runtime).toContain(
          'appName: "zoebuild"',
        );

        expect(providers).toContain(
          "<ZoeBuildLearnerWorkspaceRuntimeProvider",
        );
        expect(providers).toContain(
          "apiOrigin={props.apiOrigin}",
        );

        expect(workspace).toContain(
          '@zoeskoul/learner-workspace/fullide/FullIDE',
        );
      },
    );

    it(
      "uses the canonical Web app-session without reintroducing app-owned Auth.js",
      () => {
        const runtime = source(
          "./ZoeBuildLearnerWorkspaceRuntime.tsx",
        );
        const providers = source(
          "../../app/providers.tsx",
        );

        expect(runtime).toContain(
          'from "@zoeskoul/auth-client/react"',
        );
        expect(runtime).toContain(
          "useAppSession",
        );
        expect(runtime).toContain(
          'state.status === "authenticated"',
        );
        expect(runtime).toContain(
          "state.session.user.id",
        );

        expect(runtime).not.toContain(
          "next-auth",
        );
        expect(providers).not.toContain(
          "SessionProvider",
        );
        expect(providers).not.toContain(
          "next-auth/react",
        );
      },
    );

    it(
      "provides router Link translations and a neutral settings seam",
      () => {
        const runtime = source(
          "./ZoeBuildLearnerWorkspaceRuntime.tsx",
        );

        expect(runtime).toContain(
          'import Link from "next/link"',
        );
        expect(runtime).toContain(
          'useRouter',
        );
        expect(runtime).toContain(
          "useTranslations:",
        );
        expect(runtime).toContain(
          '"ide.codeRunner"',
        );
        expect(runtime).toContain(
          '"ide.fullIde.header"',
        );
        expect(runtime).toContain(
          "humanizeTranslationKey",
        );
        expect(runtime).toContain(
          "ZoeBuildLearnerWorkspaceSettingsMenu",
        );
      },
    );
  },
);
