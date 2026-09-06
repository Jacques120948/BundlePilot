import { describe, expect, it } from "vitest";
import {
  buildBundleComponentConfig,
  buildGroupedBundleComponentConfig,
  computeGroupedAggregateBounds,
  collectGroupedVariantIds,
} from "./mix-match-config";
import type { MixMatchOfferForConfig, MixMatchGroupedOfferForConfig } from "./mix-match-config";

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
      allowDuplicates: false,
      variantIds: baseOffer.variantIds,
    });
  });

  it("mirrors the offer-level allowDuplicates onto the single pool group", () => {
    const config = buildBundleComponentConfig({ ...baseOffer, allowDuplicates: true }, true);
    expect(config.groups[0].allowDuplicates).toBe(true);
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

const groupedOffer: MixMatchGroupedOfferForConfig = {
  id: "off_grouped_1",
  configVersion: 1,
  parentVariantId: "gid://shopify/ProductVariant/999",
  publicTitle: "Build your gift set",
  discountType: "PERCENTAGE",
  discountValue: 20,
  tiers: [],
  groups: [
    {
      id: "grp_candle",
      minSelections: 1,
      maxSelections: 1,
      required: true,
      allowDuplicates: false,
      variantIds: ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/2"],
    },
    {
      id: "grp_addon",
      minSelections: 0,
      maxSelections: 2,
      required: false,
      allowDuplicates: true,
      variantIds: ["gid://shopify/ProductVariant/3"],
    },
  ],
};

describe("computeGroupedAggregateBounds", () => {
  it("sums required groups' minimums but every group's maximum", () => {
    const bounds = computeGroupedAggregateBounds(groupedOffer.groups);
    expect(bounds).toEqual({ minItems: 1, maxItems: 3 });
  });

  it("an offer with no required groups has a zero floor", () => {
    const bounds = computeGroupedAggregateBounds([
      { minSelections: 1, maxSelections: 2, required: false },
    ]);
    expect(bounds.minItems).toBe(0);
  });
});

describe("collectGroupedVariantIds", () => {
  it("flattens every group's variant ids into one list", () => {
    expect(collectGroupedVariantIds(groupedOffer.groups)).toEqual([
      "gid://shopify/ProductVariant/1",
      "gid://shopify/ProductVariant/2",
      "gid://shopify/ProductVariant/3",
    ]);
  });
});

describe("buildGroupedBundleComponentConfig", () => {
  it("derives minItems/maxItems from the groups, not an offer-level field", () => {
    const config = buildGroupedBundleComponentConfig(groupedOffer, true);
    expect(config.minItems).toBe(1);
    expect(config.maxItems).toBe(3);
  });

  it("emits one config group per BundleGroup with its own min/max/allowDuplicates", () => {
    const config = buildGroupedBundleComponentConfig(groupedOffer, true);
    expect(config.groups).toEqual([
      {
        id: "grp_candle",
        min: 1,
        max: 1,
        required: true,
        allowDuplicates: false,
        variantIds: ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/2"],
      },
      {
        id: "grp_addon",
        min: 0,
        max: 2,
        required: false,
        allowDuplicates: true,
        variantIds: ["gid://shopify/ProductVariant/3"],
      },
    ]);
  });

  it("the offer-level allowDuplicates is unused (false) for grouped bundles", () => {
    const config = buildGroupedBundleComponentConfig(groupedOffer, true);
    expect(config.allowDuplicates).toBe(false);
  });

  it("marks the config inactive when paused, without touching the rest", () => {
    const paused = buildGroupedBundleComponentConfig(groupedOffer, false);
    expect(paused.active).toBe(false);
    expect(paused.discountValue).toBe(20);
  });
});
