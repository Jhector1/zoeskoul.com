import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./useBillingStatus.ts", import.meta.url),
  "utf8",
);

describe("billing status browser-back freshness", () => {
  it("reloads server truth when a persisted bfcache page is restored", () => {
    expect(source).toContain('window.addEventListener("pageshow", onPageShow)');
    expect(source).toContain("event.persisted");
    expect(source).toContain("void load()");
    expect(source).toContain('window.removeEventListener("pageshow", onPageShow)');
  });
});
