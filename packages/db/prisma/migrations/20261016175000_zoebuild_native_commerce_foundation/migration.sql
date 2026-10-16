-- CreateEnum
CREATE TYPE "CommerceStoreStatus" AS ENUM ('draft', 'active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "CommerceProductStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "CommerceCartStatus" AS ENUM ('active', 'converted', 'abandoned', 'expired');

-- CreateEnum
CREATE TYPE "CommerceOrderStatus" AS ENUM ('pending', 'confirmed', 'fulfilled', 'canceled');

-- CreateEnum
CREATE TYPE "CommercePaymentStatus" AS ENUM ('pending', 'authorized', 'paid', 'failed', 'partially_refunded', 'refunded');

-- CreateTable
CREATE TABLE "CommerceStore" (
    "id" TEXT NOT NULL,
    "buildProjectId" TEXT NOT NULL,
    "status" "CommerceStoreStatus" NOT NULL DEFAULT 'draft',
    "name" TEXT,
    "defaultCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "imageAltText" TEXT,
    "status" "CommerceProductStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "compareAtPriceMinor" INTEGER,
    "availableForSale" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceInventoryItem" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "trackQuantity" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceCustomer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "emailNormalized" TEXT,
    "displayName" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceCart" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "CommerceCartStatus" NOT NULL DEFAULT 'active',
    "currency" VARCHAR(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceCartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "cartId" TEXT,
    "status" "CommerceOrderStatus" NOT NULL DEFAULT 'pending',
    "paymentStatus" "CommercePaymentStatus" NOT NULL DEFAULT 'pending',
    "currency" VARCHAR(3) NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "shippingMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "paymentProvider" TEXT,
    "paymentProviderRef" TEXT,
    "placedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "lineTotalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommerceStore_buildProjectId_key" ON "CommerceStore"("buildProjectId");

-- CreateIndex
CREATE INDEX "CommerceStore_status_updatedAt_idx" ON "CommerceStore"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CommerceProduct_storeId_status_updatedAt_idx" ON "CommerceProduct"("storeId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceProduct_storeId_slug_key" ON "CommerceProduct"("storeId", "slug");

-- CreateIndex
CREATE INDEX "CommerceVariant_productId_position_idx" ON "CommerceVariant"("productId", "position");

-- CreateIndex
CREATE INDEX "CommerceVariant_availableForSale_idx" ON "CommerceVariant"("availableForSale");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceVariant_productId_sku_key" ON "CommerceVariant"("productId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceInventoryItem_variantId_key" ON "CommerceInventoryItem"("variantId");

-- CreateIndex
CREATE INDEX "CommerceCustomer_storeId_createdAt_idx" ON "CommerceCustomer"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceCustomer_storeId_externalRef_idx" ON "CommerceCustomer"("storeId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceCustomer_storeId_emailNormalized_key" ON "CommerceCustomer"("storeId", "emailNormalized");

-- CreateIndex
CREATE INDEX "CommerceCart_storeId_status_updatedAt_idx" ON "CommerceCart"("storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CommerceCart_customerId_updatedAt_idx" ON "CommerceCart"("customerId", "updatedAt");

-- CreateIndex
CREATE INDEX "CommerceCart_expiresAt_idx" ON "CommerceCart"("expiresAt");

-- CreateIndex
CREATE INDEX "CommerceCartItem_variantId_idx" ON "CommerceCartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceCartItem_cartId_variantId_key" ON "CommerceCartItem"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceOrder_cartId_key" ON "CommerceOrder"("cartId");

-- CreateIndex
CREATE INDEX "CommerceOrder_storeId_status_createdAt_idx" ON "CommerceOrder"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceOrder_storeId_paymentStatus_createdAt_idx" ON "CommerceOrder"("storeId", "paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceOrder_customerId_createdAt_idx" ON "CommerceOrder"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceOrder_paymentProvider_paymentProviderRef_idx" ON "CommerceOrder"("paymentProvider", "paymentProviderRef");

-- CreateIndex
CREATE INDEX "CommerceOrderItem_orderId_idx" ON "CommerceOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "CommerceOrderItem_variantId_idx" ON "CommerceOrderItem"("variantId");

-- AddForeignKey
ALTER TABLE "CommerceStore" ADD CONSTRAINT "CommerceStore_buildProjectId_fkey" FOREIGN KEY ("buildProjectId") REFERENCES "BuildProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceProduct" ADD CONSTRAINT "CommerceProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "CommerceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceVariant" ADD CONSTRAINT "CommerceVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CommerceProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceInventoryItem" ADD CONSTRAINT "CommerceInventoryItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CommerceVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceCustomer" ADD CONSTRAINT "CommerceCustomer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "CommerceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceCart" ADD CONSTRAINT "CommerceCart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "CommerceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceCart" ADD CONSTRAINT "CommerceCart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CommerceCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceCartItem" ADD CONSTRAINT "CommerceCartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CommerceCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceCartItem" ADD CONSTRAINT "CommerceCartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CommerceVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "CommerceStore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CommerceCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "CommerceCart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrderItem" ADD CONSTRAINT "CommerceOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommerceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrderItem" ADD CONSTRAINT "CommerceOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CommerceVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
