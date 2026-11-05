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

const shellPath =
  fileURLToPath(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild explicit Apply Plan UX",
  () => {
    it(
      "keeps AI planning read-only until the owner explicitly applies the pending plan",
      () => {
        const source =
          readFileSync(
            shellPath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "setPendingPlan(",
        );

        expect(
          source,
        ).toContain(
          "Nothing changes in project source until you apply this plan.",
        );

        expect(
          source,
        ).toContain(
          "Apply plan",
        );

        expect(
          source,
        ).toContain(
          "applyPendingPlan",
        );

        expect(
          source,
        ).toContain(
          "/apply-plan",
        );
      },
    );

    it(
      "uses optimistic source version and the planned validated specification",
      () => {
        const source =
          readFileSync(
            shellPath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "props.project.sourceVersion",
        );

        expect(
          source,
        ).toContain(
          "pendingPlan.specification",
        );

        expect(
          source,
        ).toContain(
          'method: "POST"',
        );

        expect(
          source,
        ).toContain(
          '"same-origin"',
        );
      },
    );

    it(
      "reloads canonical persisted state only after a successful apply",
      () => {
        const source =
          readFileSync(
            shellPath,
            "utf8",
          );

        // The canonical saved source is verified and hydrated in place.
        // A forced full-page reload would discard the editor/chat continuity.
        expect(source).toContain("await refreshAfterSuccessfulApply(payload.apply.sourceVersion)");
        expect(source).toContain('describeZoeActionReceipt({kind:"plan-applied"');
        expect(source).toContain("fetchAuthoritativeAppliedProject({");
        expect(source).toContain("setPreviewSourceVersion(latest.sourceVersion)");
        expect(source).not.toContain("Plan applied to source version");
      },
    );
  },
);
