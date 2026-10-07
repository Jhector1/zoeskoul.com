import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chrome = readFileSync(
  new URL("./HeaderChrome.tsx", import.meta.url),
  "utf8",
);

describe("HeaderChrome semantic theme V260A", () => {
  it("uses shared semantic theme tokens instead of hard-coded light/dark header colors", () => {
    expect(chrome).toContain("bg-[rgb(var(--ui-surface)/0.90)]");
    expect(chrome).toContain("border-[rgb(var(--ui-border)/0.78)]");
    expect(chrome).toContain("shadow-[var(--ui-shadow-soft)]");
    expect(chrome).not.toContain("bg-white/90");
    expect(chrome).not.toContain("dark:bg-neutral-950/85");
    expect(chrome).not.toContain("border-neutral-200/80");
    expect(chrome).not.toContain("dark:border-white/10");
  });
});
