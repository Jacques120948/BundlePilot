-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('QUANTITY_BREAK', 'MIX_MATCH', 'MIX_MATCH_GROUPED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'SCHEDULED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_BUNDLE_PRICE');

-- CreateEnum
CREATE TYPE "SelectionMode" AS ENUM ('MANUAL', 'COLLECTION');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('DEVELOPMENT', 'BASIC', 'PRO');

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "planName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "OfferType" NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "publicTitle" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(10,2),
    "minItems" INTEGER,
    "maxItems" INTEGER,
    "allowDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "selectionMode" "SelectionMode" NOT NULL DEFAULT 'MANUAL',
    "sourceCollectionId" TEXT,
    "combinesWithProductDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithOrderDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "combinesWithShippingDiscounts" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "shopifyDiscountId" TEXT,
    "shopifyMetaobjectId" TEXT,
    "shopifyMetaobjectHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferProduct" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "titleCache" TEXT,
    "imageCache" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferVariant" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "offerProductId" TEXT,
    "bundleGroupId" TEXT,
    "shopifyVariantId" TEXT NOT NULL,
    "titleCache" TEXT,
    "priceCache" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferTier" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleGroup" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "minSelections" INTEGER NOT NULL DEFAULT 1,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "allowDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleGroupProduct" (
    "id" TEXT NOT NULL,
    "bundleGroupId" TEXT NOT NULL,
    "offerProductId" TEXT NOT NULL,

    CONSTRAINT "BundleGroupProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferStyle" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'minimal',
    "primaryColor" TEXT,
    "textColor" TEXT,
    "backgroundColor" TEXT,
    "borderColor" TEXT,
    "borderRadius" INTEGER,
    "badgeColor" TEXT,
    "imageAspectRatio" TEXT,
    "showRegularPrice" BOOLEAN NOT NULL DEFAULT true,
    "showSavings" BOOLEAN NOT NULL DEFAULT true,
    "showPercentage" BOOLEAN NOT NULL DEFAULT true,
    "customLabels" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "offerId" TEXT,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "starts" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "addToCarts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'DEVELOPMENT',
    "status" TEXT NOT NULL DEFAULT 'active',
    "shopifySubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureEntitlement" (
    "id" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL,
    "maxActiveOffers" INTEGER NOT NULL,
    "canCreateMixMatch" BOOLEAN NOT NULL,
    "canCreateGroupedBundle" BOOLEAN NOT NULL,
    "advancedStyling" BOOLEAN NOT NULL,
    "analyticsLevel" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Shop_shopDomain_idx" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Offer_shopId_status_idx" ON "Offer"("shopId", "status");

-- CreateIndex
CREATE INDEX "Offer_shopId_type_idx" ON "Offer"("shopId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "OfferProduct_offerId_shopifyProductId_key" ON "OfferProduct"("offerId", "shopifyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferVariant_offerId_shopifyVariantId_bundleGroupId_key" ON "OfferVariant"("offerId", "shopifyVariantId", "bundleGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferTier_offerId_quantity_key" ON "OfferTier"("offerId", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "BundleGroup_offerId_sortOrder_key" ON "BundleGroup"("offerId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BundleGroupProduct_bundleGroupId_offerProductId_key" ON "BundleGroupProduct"("bundleGroupId", "offerProductId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferStyle_offerId_key" ON "OfferStyle"("offerId");

-- CreateIndex
CREATE INDEX "AnalyticsDaily_shopId_date_idx" ON "AnalyticsDaily"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_shopId_offerId_date_key" ON "AnalyticsDaily"("shopId", "offerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopId_key" ON "Subscription"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureEntitlement_plan_key" ON "FeatureEntitlement"("plan");

-- CreateIndex
CREATE INDEX "AuditLog_shopId_createdAt_idx" ON "AuditLog"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferProduct" ADD CONSTRAINT "OfferProduct_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferVariant" ADD CONSTRAINT "OfferVariant_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferVariant" ADD CONSTRAINT "OfferVariant_offerProductId_fkey" FOREIGN KEY ("offerProductId") REFERENCES "OfferProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferVariant" ADD CONSTRAINT "OfferVariant_bundleGroupId_fkey" FOREIGN KEY ("bundleGroupId") REFERENCES "BundleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferTier" ADD CONSTRAINT "OfferTier_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleGroup" ADD CONSTRAINT "BundleGroup_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleGroupProduct" ADD CONSTRAINT "BundleGroupProduct_bundleGroupId_fkey" FOREIGN KEY ("bundleGroupId") REFERENCES "BundleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleGroupProduct" ADD CONSTRAINT "BundleGroupProduct_offerProductId_fkey" FOREIGN KEY ("offerProductId") REFERENCES "OfferProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferStyle" ADD CONSTRAINT "OfferStyle_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
