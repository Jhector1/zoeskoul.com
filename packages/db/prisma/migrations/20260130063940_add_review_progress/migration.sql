/*
  Warnings:

  - You are about to drop the column `guestId` on the `ReviewProgress` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ReviewProgress` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[actorKey,subjectSlug,moduleId,locale]` on the table `ReviewProgress` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `actorKey` to the `ReviewProgress` table without a default value. This is not possible if the table is not empty.
  - Made the column `locale` on table `ReviewProgress` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "ReviewProgress_guestId_idx";

-- DropIndex
DROP INDEX "ReviewProgress_guestId_subjectSlug_moduleId_key";

-- DropIndex
DROP INDEX "ReviewProgress_subjectSlug_moduleId_idx";

-- DropIndex
DROP INDEX "ReviewProgress_userId_idx";

-- DropIndex
DROP INDEX "ReviewProgress_userId_subjectSlug_moduleId_key";

-- AlterTable
ALTER TABLE "ReviewProgress" DROP COLUMN "guestId",
DROP COLUMN "userId",
ADD COLUMN     "actorKey" TEXT NOT NULL,
ALTER COLUMN "locale" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ReviewProgress_subjectSlug_moduleId_locale_idx" ON "ReviewProgress"("subjectSlug", "moduleId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewProgress_actorKey_subjectSlug_moduleId_locale_key" ON "ReviewProgress"("actorKey", "subjectSlug", "moduleId", "locale");
