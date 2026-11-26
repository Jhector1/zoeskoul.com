\set ON_ERROR_STOP on
-- Explicit opt-in test on a local disposable or maintenance database only.
-- Fixtures and schema are transactional. Never run against production.
BEGIN;
CREATE SCHEMA zoebuild_hosted_activation_rehearsal;
SET LOCAL search_path TO zoebuild_hosted_activation_rehearsal;
CREATE TABLE "BuildProject" ("id" TEXT PRIMARY KEY);
CREATE TABLE "BuildDeployment" (
    "id" TEXT PRIMARY KEY,
    "buildProjectId" TEXT NOT NULL REFERENCES "BuildProject"("id") ON DELETE CASCADE
);
\ir ../migrations/20261125180000_zoebuild_hosted_activation_selection/migration.sql
INSERT INTO "BuildProject" VALUES ('project-one'), ('project-two');
INSERT INTO "BuildDeployment" VALUES ('release-one','project-one'), ('release-two','project-two'), ('release-three','project-one');
DO $$
DECLARE n INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM "BuildHostedActivation") THEN RAISE EXCEPTION 'unexpected backfill'; END IF;
    INSERT INTO "BuildHostedActivation" ("buildProjectId","updatedAt") VALUES ('project-one',CURRENT_TIMESTAMP);
    BEGIN
        INSERT INTO "BuildHostedActivation" ("buildProjectId","updatedAt") VALUES ('project-one',CURRENT_TIMESTAMP);
        RAISE EXCEPTION 'duplicate project selection accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        UPDATE "BuildHostedActivation" SET "deploymentId"='release-two',"activationToken"='2026-11-25T17:40:00.123456+00:00',"generation"=1 WHERE "buildProjectId"='project-one';
        RAISE EXCEPTION 'cross-project selection accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        UPDATE "BuildHostedActivation" SET "deploymentId"='release-one' WHERE "buildProjectId"='project-one';
        RAISE EXCEPTION 'partial activation accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE "BuildHostedActivation" SET "activationToken"='2026-11-25T17:40:00Z' WHERE "buildProjectId"='project-one';
        RAISE EXCEPTION 'token without release accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE "BuildHostedActivation" SET "deploymentId"='release-one',"activationToken"='invalid',"generation"=1 WHERE "buildProjectId"='project-one';
        RAISE EXCEPTION 'malformed token accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE "BuildHostedActivation" SET "generation"=-1 WHERE "buildProjectId"='project-one';
        RAISE EXCEPTION 'negative generation accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    UPDATE "BuildHostedActivation" SET "deploymentId"='release-one',"activationToken"='2026-11-25T17:40:00.123456+00:00',"generation"=1 WHERE "buildProjectId"='project-one' AND "generation"=0;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'first selection failed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "BuildHostedActivation" WHERE "activationToken"='2026-11-25T17:40:00.123456+00:00') THEN RAISE EXCEPTION 'token precision lost'; END IF;
    BEGIN
        DELETE FROM "BuildDeployment" WHERE "id"='release-one';
        RAISE EXCEPTION 'active release deletion accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    UPDATE "BuildHostedActivation" SET "deploymentId"=NULL,"activationToken"=NULL,"generation"=2 WHERE "buildProjectId"='project-one' AND "generation"=1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'unpublish failed'; END IF;
    UPDATE "BuildHostedActivation" SET "deploymentId"='release-one',"activationToken"='2026-11-25T17:40:00Z',"generation"=3 WHERE "buildProjectId"='project-one' AND "generation"=1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'stale CAS succeeded'; END IF;
    UPDATE "BuildHostedActivation" SET "deploymentId"='release-three',"activationToken"='2026-11-25T17:41:00Z',"generation"=3 WHERE "buildProjectId"='project-one' AND "generation"=2;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'republish failed'; END IF;
    DELETE FROM "BuildProject" WHERE "id"='project-one';
    IF EXISTS (SELECT 1 FROM "BuildHostedActivation" WHERE "buildProjectId"='project-one') OR EXISTS (SELECT 1 FROM "BuildDeployment" WHERE "buildProjectId"='project-one') THEN RAISE EXCEPTION 'project cascade failed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "BuildDeployment" WHERE "id"='release-two') THEN RAISE EXCEPTION 'unrelated project affected'; END IF;
    RAISE NOTICE 'PUB3B3C2C_CONSTRAINT_REHEARSAL=PASS';
END $$;
ROLLBACK;
