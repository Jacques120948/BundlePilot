import db from "../db.server";
import type { PlanTier } from "@prisma/client";

/**
 * Centralized feature gating. Route/UI code should call these helpers
 * instead of comparing `plan === "PRO"` inline (see brief item 69).
 *
 * Defaults here are the seed values written by `prisma/seed.ts`; the
 * `FeatureEntitlement` table is the editable source of truth so limits can
 * change without a code deploy.
 */
export const DEFAULT_ENTITLEMENTS: Record<
  PlanTier,
  {
    maxActiveOffers: number;
    canCreateMixMatch: boolean;
    canCreateGroupedBundle: boolean;
    advancedStyling: boolean;
    analyticsLevel: "basic" | "advanced";
  }
> = {
  DEVELOPMENT: {
    maxActiveOffers: 999,
    canCreateMixMatch: true,
    canCreateGroupedBundle: true,
    advancedStyling: true,
    analyticsLevel: "advanced",
  },
  BASIC: {
    maxActiveOffers: 10,
    canCreateMixMatch: true,
    canCreateGroupedBundle: false,
    advancedStyling: false,
    analyticsLevel: "basic",
  },
  PRO: {
    maxActiveOffers: 30,
    canCreateMixMatch: true,
    canCreateGroupedBundle: true,
    advancedStyling: true,
    analyticsLevel: "advanced",
  },
};

export async function getEntitlementsForShop(shopId: string) {
  const subscription = await db.subscription.findUnique({
    where: { shopId },
  });
  const plan = subscription?.plan ?? "DEVELOPMENT";

  const stored = await db.featureEntitlement.findUnique({ where: { plan } });

  return (
    stored ?? {
      plan,
      ...DEFAULT_ENTITLEMENTS[plan],
      id: "default",
      updatedAt: new Date(0),
    }
  );
}

export async function assertCanActivateOffer(shopId: string) {
  const entitlements = await getEntitlementsForShop(shopId);
  const activeCount = await db.offer.count({
    where: { shopId, status: "ACTIVE" },
  });

  if (activeCount >= entitlements.maxActiveOffers) {
    throw new EntitlementError(
      `Your plan allows up to ${entitlements.maxActiveOffers} active offers. Deactivate another offer or upgrade your plan.`,
    );
  }
}

export class EntitlementError extends Error {}
