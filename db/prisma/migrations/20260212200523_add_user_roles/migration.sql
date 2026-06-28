-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'teacher', 'admin');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roles" "UserRole"[] DEFAULT ARRAY['student']::"UserRole"[];

-- CreateIndex
CREATE INDEX "ReviewProgress_actorKey_idx" ON "ReviewProgress"("actorKey");
