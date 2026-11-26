\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA journal_rehearsal;
SET LOCAL search_path TO journal_rehearsal;
CREATE TABLE "BuildProject" ("id" TEXT PRIMARY KEY);
CREATE TABLE "BuildDeployment" ("id" TEXT PRIMARY KEY,"buildProjectId" TEXT NOT NULL REFERENCES "BuildProject"("id") ON DELETE CASCADE);
\ir ../migrations/20261125180000_zoebuild_hosted_activation_selection/migration.sql
\ir ../migrations/20261125190000_zoebuild_hosted_publication_operation/migration.sql
INSERT INTO "BuildProject" VALUES ('project-one'),('project-two');
INSERT INTO "BuildDeployment" VALUES ('release-one','project-one'),('release-two','project-two');
DO $$
DECLARE n INTEGER; token TEXT := '2026-11-25T17:40:00.123456+00:00';
BEGIN
 IF EXISTS(SELECT 1 FROM "BuildHostedPublicationOperation") THEN RAISE EXCEPTION 'unexpected backfill'; END IF;
 INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action","targetDeploymentId","targetSourceVersion","targetArtifactHash","targetObjectSha256") VALUES ('operation-one','project-one','owner-one',0,'publish','release-one',1,repeat('a',64),repeat('b',64));
 BEGIN
  INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action") VALUES ('operation-two','project-one','owner-one',1,'unpublish');
  RAISE EXCEPTION 'second pending accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action","targetDeploymentId","targetSourceVersion","targetArtifactHash","targetObjectSha256") VALUES ('cross-project','project-two','owner-two',0,'publish','release-one',1,repeat('a',64),repeat('b',64));
  RAISE EXCEPTION 'cross-project target accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action") VALUES ('bad-target','project-two','owner-two',0,'publish');
  RAISE EXCEPTION 'missing target accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action","targetDeploymentId") VALUES ('bad-inactive','project-two','owner-two',0,'unpublish','release-two');
  RAISE EXCEPTION 'inactive target accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action") VALUES ('bad-fence','project-two','owner-two',9223372036854775807,'unpublish');
  RAISE EXCEPTION 'exhausted fence accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE "BuildHostedPublicationOperation" SET "activationToken"=token WHERE "id"='operation-one';
  RAISE EXCEPTION 'pending token accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- Atomicity fixture: failure of the journal completion must roll back selection.
 BEGIN
  INSERT INTO "BuildHostedActivation" ("buildProjectId","deploymentId","generation","activationToken","updatedAt") VALUES ('project-one','release-one',1,token,CURRENT_TIMESTAMP);
  UPDATE "BuildHostedPublicationOperation" SET "completedAt"=CURRENT_TIMESTAMP WHERE "id"='operation-one';
  RAISE EXCEPTION 'completion without token accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM "BuildHostedActivation") THEN RAISE EXCEPTION 'selection survived failed completion'; END IF;
 INSERT INTO "BuildHostedActivation" ("buildProjectId","deploymentId","generation","activationToken","updatedAt") VALUES ('project-one','release-one',1,token,CURRENT_TIMESTAMP);
 UPDATE "BuildHostedPublicationOperation" SET "completedAt"=CURRENT_TIMESTAMP,"activationToken"=token WHERE "id"='operation-one' AND "completedAt" IS NULL AND "expectedGeneration"=0;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'completion CAS failed'; END IF;
 BEGIN
  INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action") VALUES ('reused-fence','project-one','owner-one',0,'unpublish');
  RAISE EXCEPTION 'reused generation accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 INSERT INTO "BuildHostedPublicationOperation" ("id","buildProjectId","requestedByOwnerId","expectedGeneration","action") VALUES ('operation-two','project-one','owner-one',1,'unpublish');
 UPDATE "BuildHostedActivation" SET "deploymentId"=NULL,"activationToken"=NULL,"generation"=2 WHERE "buildProjectId"='project-one' AND "generation"=1;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'unpublish CAS failed'; END IF;
 UPDATE "BuildHostedPublicationOperation" SET "completedAt"=CURRENT_TIMESTAMP WHERE "id"='operation-two' AND "completedAt" IS NULL;
 IF NOT EXISTS(SELECT 1 FROM "BuildHostedActivation" WHERE "generation"=2 AND "deploymentId" IS NULL) THEN RAISE EXCEPTION 'unpublished state lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "BuildHostedPublicationOperation" WHERE "id"='operation-one' AND "activationToken"=token AND "completedAt" IS NOT NULL) THEN RAISE EXCEPTION 'completion history lost'; END IF;
 BEGIN
  DELETE FROM "BuildDeployment" WHERE "id"='release-one';
  RAISE EXCEPTION 'journal target deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 DELETE FROM "BuildProject" WHERE "id"='project-one';
 IF EXISTS(SELECT 1 FROM "BuildHostedPublicationOperation" WHERE "buildProjectId"='project-one') THEN RAISE EXCEPTION 'project cascade failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "BuildDeployment" WHERE "id"='release-two') THEN RAISE EXCEPTION 'unrelated project affected'; END IF;
 RAISE NOTICE 'JOURNAL_CONSTRAINTS_AND_ATOMICITY_FIXTURE=PASS';
END $$;
ROLLBACK;
