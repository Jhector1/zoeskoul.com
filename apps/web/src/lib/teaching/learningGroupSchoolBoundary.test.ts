import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = process.cwd();

function source(relative: string) {
  return readFileSync(
    resolve(root, relative),
    "utf8",
  );
}

const collection = source(
  "apps/web/src/app/api/teacher/learning-groups/route.ts",
);
const item = source(
  "apps/web/src/app/api/teacher/learning-groups/[id]/route.ts",
);
const schools = source(
  "apps/web/src/app/api/teacher/schools/route.ts",
);
const school = source(
  "apps/web/src/app/api/teacher/schools/[id]/route.ts",
);
const validator = source(
  "apps/web/src/lib/validators/learningDelivery.ts",
);

describe(
  "School-aware LearningGroup browser boundary",
  () => {
    it(
      "keeps LearningGroup as the only class owner",
      () => {
        expect(validator).toContain(
          "LearningGroupInputSchema",
        );
        expect(validator).toContain(
          "organizationId",
        );

        for (const text of [
          collection,
          item,
        ]) {
          expect(text).toContain(
            "prisma.learningGroup",
          );
          expect(text).toContain(
            "ownedTeachingRecordWhere",
          );
          expect(text).toContain(
            "canTeachingUserUseOrganizationForClass",
          );
        }
      },
    );

    it(
      "reuses the canonical browser-app CORS boundary",
      () => {
        for (const text of [
          collection,
          item,
          schools,
          school,
        ]) {
          expect(text).toContain(
            'from "@/lib/http/appCors"',
          );
          expect(text).toContain(
            "appCorsJson",
          );
          expect(text).toContain(
            "appCorsPreflight",
          );
          expect(text).toContain(
            "export function OPTIONS",
          );
        }
      },
    );

    it(
      "preserves instructor members when student roster changes",
      () => {
        expect(item).toContain(
          'role: "student"',
        );
        expect(item).not.toContain(
          "deleteMany: {}",
        );
      },
    );

    it(
      "keeps school assignment optional",
      () => {
        expect(validator).toContain(
          "organizationId: z.string().min(1).nullable().optional()",
        );
        expect(collection).toContain(
          "organizationId:",
        );
        expect(item).toContain(
          "parsed.data.organizationId !== undefined",
        );
      },
    );
  },
);
