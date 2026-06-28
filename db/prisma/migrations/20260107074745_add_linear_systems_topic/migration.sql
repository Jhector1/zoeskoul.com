/*
  Warnings:

  - The values [linear_linear_systems,matrix_matrix_inverse] on the enum `PracticeTopic` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PracticeTopic_new" AS ENUM ('dot', 'projection', 'angle', 'vectors', 'linear_systems', 'augmented', 'rref', 'solution_types', 'parametric', 'matrix_ops', 'matrix_inverse', 'matrix_properties');
ALTER TABLE "PracticeQuestionInstance" ALTER COLUMN "topic" TYPE "PracticeTopic_new" USING ("topic"::text::"PracticeTopic_new");
ALTER TABLE "PracticeSection" ALTER COLUMN "topics" TYPE "PracticeTopic_new"[] USING ("topics"::text::"PracticeTopic_new"[]);
ALTER TABLE "Assignment" ALTER COLUMN "topics" TYPE "PracticeTopic_new"[] USING ("topics"::text::"PracticeTopic_new"[]);
ALTER TYPE "PracticeTopic" RENAME TO "PracticeTopic_old";
ALTER TYPE "PracticeTopic_new" RENAME TO "PracticeTopic";
DROP TYPE "public"."PracticeTopic_old";
COMMIT;
