import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ZoeBuild app ownership", () => {
  it("removes ZoeBuild implementation ownership from apps/web", () => {
    expect(existsSync(resolve(ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)), "apps/web/src/lib/build"))).toBe(false);
    expect(existsSync(resolve(ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)), "apps/web/src/app/api/build"))).toBe(false);
    expect(
      existsSync(
        resolve(
          ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
          "apps/web/src/app/(public)/[locale]/(platform)/build/projects",
        ),
      ),
    ).toBe(false);
  });

  it("owns Build implementation inside apps/zoebuild", () => {
    expect(existsSync(resolve(ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)), "apps/zoebuild/src/lib/build"))).toBe(true);
    expect(existsSync(resolve(ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)), "apps/zoebuild/src/app/api/build"))).toBe(true);
    expect(
      existsSync(resolve(ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)), "apps/zoebuild/src/app/[locale]/projects")),
    ).toBe(true);
  });
});
