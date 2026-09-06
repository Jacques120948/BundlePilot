import { describe, expect, it, vi, beforeEach } from "vitest";

const offerFindFirst = vi.fn();
const offerFindMany = vi.fn();
const offerCreate = vi.fn();
const offerUpdate = vi.fn();
const offerDelete = vi.fn();
const offerProductDeleteMany = vi.fn();
const offerProductCreateMany = vi.fn();
const offerTierDeleteMany = vi.fn();
const offerTierCreateMany = vi.fn();
const offerCount = vi.fn();
const subscriptionFindUnique = vi.fn().mockResolvedValue(null);
const featureEntitlementFindUnique = vi.fn().mockResolvedValue(null);

vi.mock("../db.server", () => ({
  default: {
    offer: {
      findFirst: (...a: unknown[]) => offerFindFirst(...a),
      findMany: (...a: unknown[]) => offerFindMany(...a),
      create: (...a: unknown[]) => offerCreate(...a),
      update: (...a: unknown[]) => offerUpdate(...a),
      delete: (...a: unknown[]) => offerDelete(...a),
      count: (...a: unknown[]) => offerCount(...a),
    },
    offerProduct: {
      deleteMany: (...a: unknown[]) => offerProductDeleteMany(...a),
      createMany: (...a: unknown[]) => offerProductCreateMany(...a),
    },
    offerTier: {
      deleteMany: (...a: unknown[]) => offerTierDeleteMany(...a),
      createMany: (...a: unknown[]) => offerTierCreateMany(...a),
    },
    subscription: {
      findUnique: (...a: unknown[]) => subscriptionFindUnique(...a),
    },
    featureEntitlement: {
      findUnique: (...a: unknown[]) => featureEntitlementFindUnique(...a),
    },
  },
}));

const {
  createQuantityBreakDraft,
  getOwnedOffer,
  OfferNotFoundError,
  OfferValidationError,
  OfferConflictError,
  findConflictingActiveOffers,
  activateOffer,
  deleteOffer,
} = await import("./offers.server");

const validData = {
  name: "Buy more candles",
  publicTitle: "Buy more & save",
  products: [{ shopifyProductId: "gid://shopify/Product/1" }],
  tiers: [
    { quantity: 1, discountType: "PERCENTAGE" as const, discountValue: 0 },
    { quantity: 2, discountType: "PERCENTAGE" as const, discountValue: 10 },
  ],
};

describe("offers.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects creating a draft that fails validation", async () => {
    await expect(
      createQuantityBreakDraft("shop_1", { ...validData, products: [] }),
    ).rejects.toBeInstanceOf(OfferValidationError);
    expect(offerCreate).not.toHaveBeenCalled();
  });

  it("creates a draft offer and its products/tiers when valid", async () => {
    offerCreate.mockResolvedValue({ id: "off_1" });
    offerFindFirst.mockResolvedValue({
      id: "off_1",
      shopId: "shop_1",
      tiers: [],
      products: [],
    });

    const result = await createQuantityBreakDraft("shop_1", validData);

    expect(offerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: "shop_1", type: "QUANTITY_BREAK", status: "DRAFT" }),
      }),
    );
    expect(offerProductCreateMany).toHaveBeenCalled();
    expect(offerTierCreateMany).toHaveBeenCalled();
    expect(result).toEqual({ id: "off_1", shopId: "shop_1", tiers: [], products: [] });
  });

  it("throws OfferNotFoundError for an offer belonging to another shop", async () => {
    offerFindFirst.mockResolvedValue(null);

    await expect(getOwnedOffer("shop_1", "off_from_other_shop")).rejects.toBeInstanceOf(
      OfferNotFoundError,
    );
    // Must have scoped the lookup by shopId, not just offer id.
    expect(offerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "off_from_other_shop", shopId: "shop_1" } }),
    );
  });

  it("finds conflicting active offers sharing a product", async () => {
    offerFindMany.mockResolvedValue([{ id: "off_2", name: "Existing offer" }]);

    const conflicts = await findConflictingActiveOffers("shop_1", "off_1", [
      "gid://shopify/Product/1",
    ]);

    expect(conflicts).toEqual([{ offerId: "off_2", name: "Existing offer" }]);
  });

  it("blocks activation when a conflicting active offer exists", async () => {
    offerFindFirst.mockResolvedValue({
      id: "off_1",
      shopId: "shop_1",
      status: "DRAFT",
      products: [{ shopifyProductId: "gid://shopify/Product/1" }],
      tiers: [],
    });
    offerCount.mockResolvedValue(0);
    offerFindMany.mockResolvedValue([{ id: "off_2", name: "Existing offer" }]);

    await expect(activateOffer("shop_1", "off_1")).rejects.toBeInstanceOf(
      OfferConflictError,
    );
    expect(offerUpdate).not.toHaveBeenCalled();
  });

  it("activates an offer with no conflicts and available entitlement", async () => {
    offerFindFirst.mockResolvedValue({
      id: "off_1",
      shopId: "shop_1",
      status: "DRAFT",
      products: [{ shopifyProductId: "gid://shopify/Product/1" }],
      tiers: [],
    });
    offerCount.mockResolvedValue(0);
    offerFindMany.mockResolvedValue([]);
    offerUpdate.mockResolvedValue({ id: "off_1", status: "ACTIVE" });

    const result = await activateOffer("shop_1", "off_1");

    expect(result).toEqual({ id: "off_1", status: "ACTIVE" });
  });

  it("deletes only an offer owned by the requesting shop", async () => {
    offerFindFirst.mockResolvedValue({ id: "off_1", shopId: "shop_1", tiers: [], products: [] });
    offerDelete.mockResolvedValue({});

    await deleteOffer("shop_1", "off_1");

    expect(offerDelete).toHaveBeenCalledWith({ where: { id: "off_1" } });
  });
});
