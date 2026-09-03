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
  "apps/web/src/app/api/teacher/course-assignments/route.ts",
);
const item = source(
  "apps/web/src/app/api/teacher/course-assignments/[id]/route.ts",
);
const invites = source(
  "apps/web/src/app/api/teacher/course-assignments/[id]/invites/route.ts",
);
const assignmentAdmin = source(
  "apps/web/src/lib/learningAssignments/assignmentAdminServer.ts",
);
const validator = source(
  "apps/web/src/lib/validators/learningDelivery.ts",
);
const schema = source(
  "packages/db/prisma/schema.prisma",
);

describe(
  "Teacher course-assignment browser boundary",
  () => {
    it(
      "keeps the existing LearningAssignment ownership model",
      () => {
        expect(schema).toContain(
          "model LearningAssignment {",
        );
        expect(schema).toContain(
          "model LearningAssignmentGroup {",
        );
        expect(schema).toContain(
          "model LearningAssignmentUser {",
        );
        expect(schema).toContain(
          "model LearningAssignmentInvite {",
        );

        expect(validator).toContain(
          "LearningAssignmentInputSchema",
        );

        for (const text of [
          collection,
          item,
        ]) {
          expect(text).toContain(
            "resolveLearningAssignmentWrite",
          );
          expect(text).toContain(
            "ownedTeachingRecordWhere",
          );
        }
      },
    );

    it(
      "uses the canonical browser-app CORS owner on all Teacher assignment endpoints",
      () => {
        for (const text of [
          collection,
          item,
          invites,
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
            "isAppMutationOriginAllowed",
          );
          expect(text).toContain(
            "export function OPTIONS",
          );
          expect(text).not.toContain(
            'from "next/server"',
          );
        }

        expect(collection).toContain(
          "isAppOriginAllowed",
        );
        expect(item).toContain(
          "isAppOriginAllowed",
        );
      },
    );

    it(
      "extends the existing collection GET for localized editor course data instead of adding another API",
      () => {
        expect(collection).toContain(
          'url.searchParams.get("editor")',
        );
        expect(collection).toContain(
          "resolveSubjectDeliveryPresentations",
        );
        expect(collection).toContain(
          'visibility: "private"',
        );
        expect(collection).toContain(
          'status: "active"',
        );
        expect(collection).toContain(
          "{ assignments },",
        );
        expect(collection).toContain(
          "courses,",
        );
      },
    );

    it(
      "preserves existing assignment write and invitation services",
      () => {
        expect(collection).toContain(
          "learningAssignmentAudienceCreateData",
        );
        expect(item).toContain(
          "learningAssignmentAudienceReplaceData",
        );
        expect(collection).toContain(
          "syncPendingLearningAssignmentInvites",
        );
        expect(item).toContain(
          "syncPendingLearningAssignmentInvites",
        );
        expect(invites).toContain(
          "rotateLearningAssignmentInvite",
        );
        expect(invites).toContain(
          "sendLearningAssignmentInviteEmail",
        );

        expect(assignmentAdmin).toContain(
          "LearningAssignmentWriteResolution",
        );
      },
    );

    it(
      "recognizes all current ZoeSkoul locales for Teacher browser delivery",
      () => {
        expect(collection).toContain(
          'new Set(["en", "es", "fr", "ht"])',
        );
        expect(item).toContain(
          'new Set(["en", "es", "fr", "ht"])',
        );
        expect(invites).toContain(
          'z.enum(["en", "es", "fr", "ht"])',
        );
      },
    );
  },
);
