-- CreateEnum
CREATE TYPE "CommerceInventoryReservationStatus" AS ENUM ('reserved', 'committed', 'released');

-- AlterTable
ALTER TABLE "CommerceOrder"
ADD COLUMN "paymentEnvironment" "CommerceProviderEnvironment",
ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommerceInventoryReservation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "CommerceInventoryReservationStatus" NOT NULL DEFAULT 'reserved',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceInventoryReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommerceInventoryReservation_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "CommerceInventoryReservation_orderId_inventoryItemId_key"
ON "CommerceInventoryReservation"("orderId", "inventoryItemId");

CREATE INDEX "CommerceInventoryReservation_inventoryItemId_status_expiresAt_idx"
ON "CommerceInventoryReservation"("inventoryItemId", "status", "expiresAt");

CREATE INDEX "CommerceInventoryReservation_status_expiresAt_idx"
ON "CommerceInventoryReservation"("status", "expiresAt");

CREATE INDEX "CommerceOrder_paymentProvider_paymentEnvironment_paymentStatus_checkoutExpiresAt_idx"
ON "CommerceOrder"("paymentProvider", "paymentEnvironment", "paymentStatus", "checkoutExpiresAt");

ALTER TABLE "CommerceInventoryReservation"
ADD CONSTRAINT "CommerceInventoryReservation_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "CommerceOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommerceInventoryReservation"
ADD CONSTRAINT "CommerceInventoryReservation_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "CommerceInventoryItem"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
