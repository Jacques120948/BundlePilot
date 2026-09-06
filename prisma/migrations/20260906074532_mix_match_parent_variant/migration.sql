/*
  Warnings:

  - You are about to drop the column `shopifyMetaobjectHandle` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyMetaobjectId` on the `Offer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "shopifyMetaobjectHandle",
DROP COLUMN "shopifyMetaobjectId",
ADD COLUMN     "configVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "shopifyParentProductId" TEXT,
ADD COLUMN     "shopifyParentVariantId" TEXT;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "cartTransformId" TEXT;
