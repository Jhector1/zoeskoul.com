import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  "src/app/api/teacher/tutoring-requests/route.ts",
  "src/app/api/teacher/tutoring-pool/route.ts",
  "src/app/api/teacher/tutoring-availability/route.ts",
  "src/app/api/teacher/tutoring-requests/[id]/schedule/route.ts",
  "src/app/api/teacher/tutoring-requests/[id]/prepare/route.ts",
  "src/app/api/teacher/tutoring-bookings/[id]/complete/route.ts",
  "src/app/api/teacher/tutoring-bookings/[id]/cancel/route.ts",
];

function source(relativePath: string) {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("commercial tutoring browser-app boundary", () => {
  it.each(ROUTES)(
    "%s exposes CORS through the canonical app boundary",
    (relativePath) => {
      const text = source(relativePath);

      expect(text).toContain(
        'from "@/lib/http/appCors"',
      );
      expect(text).toContain("appCorsJson");
      expect(text).toContain("appCorsPreflight");
      expect(text).toContain(
        "export function OPTIONS(request: Request)",
      );
      expect(text).not.toContain("enforceSameOriginPost");
      expect(text).not.toContain("bodyJsonResponse");
    },
  );

  it.each([
    "src/app/api/teacher/tutoring-pool/route.ts",
    "src/app/api/teacher/tutoring-availability/route.ts",
  ])(
    "%s validates GET and mutation origins separately",
    (relativePath) => {
      const text = source(relativePath);
      expect(text).toContain(
        "isAppOriginAllowed(request)",
      );
      expect(text).toContain(
        "isAppMutationOriginAllowed(request)",
      );
    },
  );

  it.each([
    "src/app/api/teacher/tutoring-requests/[id]/schedule/route.ts",
    "src/app/api/teacher/tutoring-requests/[id]/prepare/route.ts",
    "src/app/api/teacher/tutoring-bookings/[id]/complete/route.ts",
    "src/app/api/teacher/tutoring-bookings/[id]/cancel/route.ts",
  ])(
    "%s uses the mutation-origin boundary",
    (relativePath) => {
      expect(source(relativePath)).toContain(
        "isAppMutationOriginAllowed(request)",
      );
    },
  );
});
