import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = [
  "progress/route.ts",
  "questions/route.ts",
  "learners/[actorKey]/route.ts",
] as const;

describe("Admin API presentation ownership", () => {
  it.each(routes)(
    "%s delegates tagged content to the shared Web presentation boundary",
    (relative) => {
      const source = readFileSync(
        new URL(`./${relative}`, import.meta.url),
        "utf8",
      );

      expect(source).toContain(
        'import { resolveTaggedPresentation } from "@/i18n/resolveTaggedPresentation"',
      );
      expect(source).toContain(
        "await resolveTaggedPresentation(data)",
      );

      expect(source).not.toContain("isTaggedKey");
      expect(source).not.toContain("stripTag");
      expect(source).not.toContain("resolveDeepTagged");
      expect(source).not.toContain("messages.generated");
    },
  );
});
