import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(fileURLToPath(new URL("CourseContentUpdateBanner.tsx", import.meta.url)), "utf8");
describe("course update banner route independence", () => {
  it("uses native Next.js pathname rather than a next-intl navigation hook", () => {
    expect(source).toContain('import { usePathname, useSearchParams } from "next/navigation";');
    expect(source).not.toContain('@/i18n/navigation');
  });
  it("uses a browser-level reload link without NavButton dependencies", () => {
    expect(source).not.toContain('NavButton');
    expect(source).toContain('href={currentHref}');
    expect(source).toContain('Refresh now');
  });
});
