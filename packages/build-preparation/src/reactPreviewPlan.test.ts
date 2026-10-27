import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BuildPreparationError,
  resolveRegisteredReactPreviewServerPlan,
} from "./index";

describe(
  "registered React/Vite live-preview plan",
  () => {
    it(
      "derives install, dev command and port only from the registry",
      () => {
        expect(
          resolveRegisteredReactPreviewServerPlan({
            stackId:
              "react-vite-v1",
            templateId:
              "react-vite-v1",
          }),
        ).toEqual({
          stackId:
            "react-vite-v1",
          templateId:
            "react-vite-v1",
          installCommand: [
            "pnpm",
            "install",
            "--frozen-lockfile",
            "--ignore-scripts",
          ],
          devCommand: [
            "pnpm",
            "dev",
            "--host",
            "0.0.0.0",
          ],
          port:
            5173,
        });
      },
    );

    it(
      "fails closed for static or mismatched stacks",
      () => {
        expect(
          () =>
            resolveRegisteredReactPreviewServerPlan({
              stackId:
                "static-html-v1",
              templateId:
                "static-html-v1",
            }),
        ).toThrow(
          BuildPreparationError,
        );

        expect(
          () =>
            resolveRegisteredReactPreviewServerPlan({
              stackId:
                "react-vite-v1",
              templateId:
                "static-html-v1",
            }),
        ).toThrow(
          BuildPreparationError,
        );
      },
    );
  },
);
