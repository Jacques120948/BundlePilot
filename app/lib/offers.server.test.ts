import { describe, expect, it, vi, beforeEach } from "vitest";

const offerFindFirst = vi.fn();
const offerFindMany = vi.fn();
const offerCreate = vi.fn();
const offerUpdate = vi.fn();
const offerDelete = vi.fn();
const offerProductDeleteMany = vi.fn();
const offerProductCreateMany = vi.fn();
const offerVariantDeleteMany = vi.fn();
const offerVariantCreateMany = vi.fn();
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
    offerVariant: {
      deleteMany: (...a: unknown[]) => offerVariantDeleteMany(...a),
      createMany: (...a: unknown[]) => offerVariantCreateMany(...a),
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
  createMixMatchDraft,
  updateMixMatchOffer,
  getOwnedOffer,
  OfferNotFoundError,
  OfferValidationError,
  OfferConflictError,
  findConflictingActiveOffers,
  activateOffer,
  deleteOffer,
} = await import("./offers.server");

const validQuantityBreakData = {
  name: "Buy more candles",
  publicTitle: "Buy more & save",
  products: [{ shopifyProductId: "gid://shopify/Product/1" }],
  tiers: [
    { quantity: 1, discountType: "PERCENTAGE" as const, discountValue: 0 },
    { quantity: 2, discountType: "PERCENTAGE" as const, discountValue: 10 },
  ],
};

const validMixMatchData = {
  name: "Build your coffret",
  publicTitle: "Compose your bundle",
  variantIds: [
    "gid://shopify/ProductVariant/1",
    "gid://shopify/ProductVariant/2",
    "gid://shopify/ProductVariant/3",
  ],
  minItems: 3,
  maxItems: 3,
  allowDuplicates: false,
  discountType: "PERCENTAGE" as const,
  discountValue: 15,
  tiers: [],
};

describe("offers.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects creating a Quantity Break draft that fails validation", async () => {
    await expect(
      createQuantityBreakDraft("shop_1", { ...validQuantityBreakData, products: [] }),
    ).rejects.toBeInstanceOf(OfferValidationError);
    expect(offerCreate).not.toHaveBeenCalled();
  });

  it("creates a Quantity Break draft offer and its products/tiers when valid", async () => {
    offerCreate.mockResolvedValue({ id: "off_1" });
    offerFindFirst.mockResolvedValue({
      id: "off_1",
      shopId: "shop_1",
      tiers: [],
      products: [],
      variants: [],
    });

    const result = await createQuantityBreakDraft("shop_1", validQuantityBreakData);

    expect(offerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: "shop_1", type: "QUANTITY_BREAK", status: "DRAFT" }),
      }),
    );
    expect(offerProductCreateMany).toHaveBeenCalled();
    expect(offerTierCreateMany).toHaveBeenCalled();
    expect(result).toEqual({ id: "off_1", shopId: "shop_1", tiers: [], products: [], variants: [] });
  });

  it("rejects creating a Mix & Match draft that fails validation", async () => {
    await expect(
      createMixMatchDraft("shop_1", { ...validMixMatchData, variantIds: [] }),
    ).rejects.toBeInstanceOf(OfferValidationError);
    expect(offerCreate).not.toHaveBeenCalled();
  });

  it("creates a Mix & Match draft offer and its variant pool when valid", async () => {
    offerCreate.mockResolvedValue({ id: "off_mm_1" });
    offerFindFirst.mockResolvedValue({
      id: "off_mm_1",
      shopId: "shop_1",
      tiers: [],
      products: [],
      variants: validMixMatchData.variantIds.map((shopifyVariantId) => ({ shopifyVariantId })),
    });

    await createMixMatchDraft("shop_1", validMixMatchData);

    expect(offerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: "shop_1", type: "MIX_MATCH", status: "DRAFT" }),
      }),
    );
    expect(offerVariantCreateMany).toHaveBeenCalledWith({
      data: validMixMatchData.variantIds.map((shopifyVariantId) => ({
        offerId: "off_mm_1",
        shopifyVariantId,
      })),
    });
  });

  it("bumps configVersion when a Mix & Match offer is updated", async () => {
    offerFindFirst.mockResolvedValue({
      id: "off_mm_1",
      shopId: "shop_1",
      tiers: [],
      products: [],
      variants: [],
    });
    offerUpdate.mockResolvedValue({});

    await updateMixMatchOffer("shop_1", "off_mm_1", validMixMatchData);

    expect(offerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "off_mm_1" },
        data: expect.objectContaining({ configVersion: { increment: 1 } }),
      }),
    );
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

    const conflicts = await findConflictingActiveOffers("shop_1", "off_1", {
      shopifyProductIds: ["gid://shopify/Product/1"],
    });

    expect(conflicts).toEqual([{ offerId: "off_2", name: "Existing offer" }]);
  });

  it("finds conflicting active offers sharing a variant", async () => {
    offerFindMany.mockResolvedValue([{ id: "off_3", name: "Existing Mix & Match" }]);

    const conflicts = await findConflictingActiveOffers("shop_1", "off_mm_1", {
      shopifyVariantIds: ["gid://shopify/ProductVariant/1"],
    });

    expect(conflicts).toEqual([{ offerId: "off_3", name: "Existing Mix & Match" }]);
  });

  it("blocks activation when a conflicting active offer exists", async () => {
    offerFindFirst.mockResolvedValue({
      id: "off_1",
      shopId: "shop_1",
      status: "DRAFT",
      products: [{ shopifyProductId: "gid://shopify/Product/1" }],
      variants: [],
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
      variants: [],
      tiers: [],
    });
    offerCount.mockResolvedValue(0);
    offerFindMany.mockResolvedValue([]);
    offerUpdate.mockResolvedValue({ id: "off_1", status: "ACTIVE" });

    const result = await activateOffer("shop_1", "off_1");

    expect(result).toEqual({ id: "off_1", status: "ACTIVE" });
  });

  it("deletes only an offer owned by the requesting shop", async () => {
    offerFindFirst.mockResolvedValue({
      id: "off_1",
      shopId: "shop_1",
      tiers: [],
      products: [],
      variants: [],
    });
    offerDelete.mockResolvedValue({});

    await deleteOffer("shop_1", "off_1");

    expect(offerDelete).toHaveBeenCalledWith({ where: { id: "off_1" } });
  });
});
