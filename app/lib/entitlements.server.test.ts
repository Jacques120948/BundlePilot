import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSubscriptionFindUnique = vi.fn();
const mockFeatureEntitlementFindUnique = vi.fn();
const mockOfferCount = vi.fn();

vi.mock("../db.server", () => ({
  default: {
    subscription: { findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args) },
    featureEntitlement: {
      findUnique: (...args: unknown[]) => mockFeatureEntitlementFindUnique(...args),
    },
    offer: { count: (...args: unknown[]) => mockOfferCount(...args) },
  },
}));

const { getEntitlementsForShop, assertCanActivateOffer, EntitlementError } =
  await import("./entitlements.server");

describe("entitlements", () => {
  beforeEach(() => {
    mockSubscriptionFindUnique.mockReset();
    mockFeatureEntitlementFindUnique.mockReset();
    mockOfferCount.mockReset();
  });

  it("falls back to DEVELOPMENT defaults when a shop has no subscription row", async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null);
    mockFeatureEntitlementFindUnique.mockResolvedValue(null);

    const entitlements = await getEntitlementsForShop("shop_1");

    expect(entitlements.maxActiveOffers).toBe(999);
    expect(entitlements.canCreateGroupedBundle).toBe(true);
  });

  it("uses the stored FeatureEntitlement row over the hardcoded default when present", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ plan: "BASIC" });
    mockFeatureEntitlementFindUnique.mockResolvedValue({
      plan: "BASIC",
      maxActiveOffers: 5,
      canCreateMixMatch: true,
      canCreateGroupedBundle: false,
      advancedStyling: false,
      analyticsLevel: "basic",
    });

    const entitlements = await getEntitlementsForShop("shop_1");

    expect(entitlements.maxActiveOffers).toBe(5);
  });

  it("rejects activating an offer once the plan's active offer limit is reached", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ plan: "BASIC" });
    mockFeatureEntitlementFindUnique.mockResolvedValue(null);
    mockOfferCount.mockResolvedValue(10); // BASIC default limit

    await expect(assertCanActivateOffer("shop_1")).rejects.toBeInstanceOf(
      EntitlementError,
    );
  });

  it("allows activating an offer under the limit", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ plan: "BASIC" });
    mockFeatureEntitlementFindUnique.mockResolvedValue(null);
    mockOfferCount.mockResolvedValue(2);

    await expect(assertCanActivateOffer("shop_1")).resolves.toBeUndefined();
  });
});
