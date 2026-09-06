CREATE TABLE "LearningOrganizationCourseAccess" (
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningOrganizationCourseAccess_pkey"
      PRIMARY KEY ("organizationId", "subjectId")
);

CREATE INDEX "LearningOrganizationCourseAccess_subjectId_idx"
ON "LearningOrganizationCourseAccess"("subjectId");

ALTER TABLE "LearningOrganizationCourseAccess"
ADD CONSTRAINT "LearningOrganizationCourseAccess_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "LearningOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningOrganizationCourseAccess"
ADD CONSTRAINT "LearningOrganizationCourseAccess_subjectId_fkey"
FOREIGN KEY ("subjectId")
REFERENCES "PracticeSubject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LearningOrganizationCourseAccess"
    ("organizationId", "subjectId", "enabledAt")
SELECT DISTINCT
    g."organizationId",
    a."subjectId",
    CURRENT_TIMESTAMP
FROM "LearningAssignmentGroup" ag
JOIN "LearningGroup" g
  ON g."id" = ag."groupId"
JOIN "LearningAssignment" a
  ON a."id" = ag."assignmentId"
WHERE g."organizationId" IS NOT NULL
ON CONFLICT ("organizationId", "subjectId") DO NOTHING;
