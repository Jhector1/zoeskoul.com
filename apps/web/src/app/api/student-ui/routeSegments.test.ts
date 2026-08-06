import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const tutoringSessionRoutes = fileURLToPath(
  new URL("./tutoring-sessions", import.meta.url),
);

function isDynamicSegment(name: string) {
  return /^\[(?:\.\.\.)?.+\]$/.test(name);
}

describe("Student UI API route segments", () => {
  it("uses one dynamic parameter name for tutoring-session siblings", () => {
    const dynamicDirectories = readdirSync(tutoringSessionRoutes, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && isDynamicSegment(entry.name))
      .map((entry) => entry.name)
      .sort();

    expect(dynamicDirectories).toEqual(["[id]"]);
  });
});
