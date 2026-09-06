import { describe, expect, it } from "vitest";
import { buildBundleComponentConfig } from "./mix-match-config";
import type { MixMatchOfferForConfig } from "./mix-match-config";

const baseOffer: MixMatchOfferForConfig = {
  id: "off_1",
  configVersion: 3,
  parentVariantId: "gid://shopify/ProductVariant/999",
  publicTitle: "Compose your bundle",
  minItems: 3,
  maxItems: 3,
  allowDuplicates: false,
  discountType: "PERCENTAGE",
  discountValue: 15,
  tiers: [],
  variantIds: [
    "gid://shopify/ProductVariant/1",
    "gid://shopify/ProductVariant/2",
    "gid://shopify/ProductVariant/3",
  ],
};

describe("buildBundleComponentConfig", () => {
  it("carries the offer id and version for the tamper check", () => {
    const config = buildBundleComponentConfig(baseOffer, true);
    expect(config.offerId).toBe("off_1");
    expect(config.offerVersion).toBe(3);
  });

  it("marks the config inactive when the offer is paused, without touching anything else", () => {
    const active = buildBundleComponentConfig(baseOffer, true);
    const paused = buildBundleComponentConfig(baseOffer, false);
    expect(active.active).toBe(true);
    expect(paused.active).toBe(false);
    expect(paused.discountValue).toBe(15);
  });

  it("puts the whole flat pool into a single group matching minItems/maxItems", () => {
    const config = buildBundleComponentConfig(baseOffer, true);
    expect(config.groups).toHaveLength(1);
    expect(config.groups[0]).toEqual({
      id: "pool",
      min: 3,
      max: 3,
      required: true,
      variantIds: baseOffer.variantIds,
    });
  });

  it("carries tiers verbatim when the offer uses volume tiers instead of a flat discount", () => {
    const withTiers: MixMatchOfferForConfig = {
      ...baseOffer,
      discountType: null,
      discountValue: null,
      tiers: [
        { quantity: 2, discountType: "PERCENTAGE", discountValue: 10 },
        { quantity: 3, discountType: "PERCENTAGE", discountValue: 15 },
      ],
    };
    const config = buildBundleComponentConfig(withTiers, true);
    expect(config.discountType).toBeNull();
    expect(config.tiers).toEqual(withTiers.tiers);
  });
});
