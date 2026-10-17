import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(process.cwd(), "../..");
const read = (p: string) =>
  readFileSync(resolve(repo, p), "utf8");

describe("provider-neutral checkout ownership", () => {
  const runtime = read(
    "apps/zoebuild/src/lib/commerce/commerceRuntime.ts",
  );
  const checkout = read(
    "apps/zoebuild/src/lib/commerce/nativeCommerceCheckout.ts",
  );

  it("selects full checkout through the shared runtime", () => {
    expect(runtime).toContain('"commerce.checkout"');
    expect(runtime).toContain("beginCommerceCheckout");
    expect(checkout).not.toContain(
      'capability:\n          "checkout"',
    );
  });

  it("keeps ZoeStore order ownership explicit", () => {
    expect(checkout).toContain(
      'capability:\n          "orders"',
    );
    expect(checkout).toContain("ZOESTORE_COMMERCE_PROVIDER");
  });

  it("keeps payment execution separate", () => {
    expect(checkout).toContain(
      'capability:\n          "payments"',
    );
    expect(checkout).toContain(
      "COMMERCE_PAYMENT_CHECKOUT_EXECUTORS",
    );
  });
});
