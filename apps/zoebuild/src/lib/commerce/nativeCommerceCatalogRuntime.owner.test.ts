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

function source(
  relative:
    string,
) {
  return readFileSync(
    fileURLToPath(
      new URL(
        relative,
        import.meta.url,
      ),
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild Native Commerce catalog runtime",
  () => {
    it(
      "resolves preview project identity from the runner-held capability record",
      () => {
        const runtime =
          source(
            "../../../../runner/src/services/build/reactPreviewRuntime.ts",
          );
        const route =
          source(
            "../../../../runner/src/routes/build.previews.resolveCapability.ts",
          );

        expect(
          runtime,
        ).toContain(
          "resolveReactPreviewContextByCapability",
        );
        expect(
          runtime,
        ).toContain(
          "normalizePreviewRequestPath(\n    record,\n    input.path",
        );
        expect(
          runtime,
        ).toContain(
          "buildProjectId:\n      record.buildProjectId",
        );
        expect(
          route,
        ).not.toContain(
          "getRequiredActorKey",
        );
      },
    );

    it(
      "does not trust the browser project id when preview catalog data is requested",
      () => {
        const route =
          source(
            "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts",
          );

        expect(
          route,
        ).toContain(
          "resolveTrustedReactPreviewCapabilityAtRunner",
        );
        expect(
          route,
        ).toContain(
          "context.buildProjectId !==\n        buildProjectId",
        );
        expect(
          route,
        ).toContain(
          '"__zoebuild/commerce/products"',
        );
      },
    );

    it(
      "scopes catalog reads through BuildProject and never accepts a store id",
      () => {
        const catalog =
          source(
            "./nativeCommerceCatalog.ts",
          );

        expect(
          catalog,
        ).toContain(
          "store: {\n            buildProjectId",
        );
        expect(
          catalog,
        ).toContain(
          'status:\n            "active"',
        );
        expect(
          catalog,
        ).not.toContain(
          "storeId:",
        );
        expect(
          catalog,
        ).not.toContain(
          "paymentProvider",
        );
      },
    );

    it(
      "requires the existing ready published deployment before catalog routing",
      () => {
        const route =
          source(
            "../../app/sites/[buildProjectId]/[[...path]]/route.ts",
          );

        const deployment =
          route.indexOf(
            ".buildDeployment",
          );
        const ready =
          route.indexOf(
            '"ready"',
            deployment,
          );
        const catalog =
          route.indexOf(
            '"__zoebuild/commerce/products"',
          );

        expect(
          deployment,
        ).toBeGreaterThan(
          -1,
        );
        expect(
          ready,
        ).toBeGreaterThan(
          deployment,
        );
        expect(
          catalog,
        ).toBeGreaterThan(
          ready,
        );
      },
    );
    it(
      "resolve-capability route remains behind global runner service auth",
      () => {
        const app =
          source(
            "../../../../runner/src/app.ts",
          );
        const serviceAuth =
          app.indexOf(
            "app.use(requireServiceAuth)",
          );
        const resolver =
          app.indexOf(
            'app.post("/build/previews/:previewId/resolve-capability"',
          );

        expect(
          serviceAuth,
        ).toBeGreaterThan(
          -1,
        );
        expect(
          resolver,
        ).toBeGreaterThan(
          serviceAuth,
        );
      },
    );

  },
);
