-- AlterTable
ALTER TABLE "CommerceCart" ADD COLUMN     "publicTokenHash" VARCHAR(64) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CommerceCart_publicTokenHash_key" ON "CommerceCart"("publicTokenHash");
