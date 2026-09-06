import { describe, expect, it } from "vitest";
import {
  buildGroupedMixMatchBundlesDisplay,
  buildMixMatchBundlesDisplay,
} from "./mix-match-display-config";
import type {
  MixMatchOfferForDisplay,
  MixMatchGroupedOfferForDisplay,
} from "./mix-match-display-config";

const OFFER: MixMatchOfferForDisplay = {
  id: "off_1",
  publicTitle: "Compose your bundle",
  description: "Pick any 3",
  minItems: 3,
  maxItems: 3,
  allowDuplicates: false,
  discountType: "PERCENTAGE",
  discountValue: 15,
  tiers: [],
  variants: [
    {
      shopifyVariantId: "gid://shopify/ProductVariant/1",
      titleCache: "Candle A",
      imageCache: "https://cdn.example/a.jpg",
      priceCache: 20,
    },
    {
      shopifyVariantId: "gid://shopify/ProductVariant/2",
      titleCache: null,
      imageCache: null,
      priceCache: null,
    },
  ],
};

describe("buildMixMatchBundlesDisplay", () => {
  it("keys the map by offer id", () => {
    const display = buildMixMatchBundlesDisplay([OFFER]);
    expect(Object.keys(display)).toEqual(["off_1"]);
  });

  it("maps each variant's cache fields into a display product", () => {
    const display = buildMixMatchBundlesDisplay([OFFER]);
    expect(display.off_1.products[0]).toEqual({
      variantId: "gid://shopify/ProductVariant/1",
      title: "Candle A",
      imageUrl: "https://cdn.example/a.jpg",
      price: 20,
    });
  });

  it("falls back to the variant id as the title when no cache is set", () => {
    const display = buildMixMatchBundlesDisplay([OFFER]);
    expect(display.off_1.products[1].title).toBe("gid://shopify/ProductVariant/2");
  });

  it("produces an empty map for no active offers", () => {
    expect(buildMixMatchBundlesDisplay([])).toEqual({});
  });

  it("includes multiple offers side by side", () => {
    const second: MixMatchOfferForDisplay = { ...OFFER, id: "off_2", publicTitle: "Second bundle" };
    const display = buildMixMatchBundlesDisplay([OFFER, second]);
    expect(Object.keys(display).sort()).toEqual(["off_1", "off_2"]);
  });
});

const GROUPED_OFFER: MixMatchGroupedOfferForDisplay = {
  id: "off_grouped_1",
  publicTitle: "Build your gift set",
  description: "One candle, one bracelet",
  discountType: "PERCENTAGE",
  discountValue: 20,
  tiers: [],
  groups: [
    {
      id: "grp_candle",
      name: "Candle",
      description: null,
      minSelections: 1,
      maxSelections: 1,
      required: true,
      allowDuplicates: false,
      variants: [
        {
          shopifyVariantId: "gid://shopify/ProductVariant/1",
          titleCache: "Candle A",
          imageCache: null,
          priceCache: 20,
        },
      ],
    },
    {
      id: "grp_melts",
      name: "Wax melts (optional)",
      description: null,
      minSelections: 0,
      maxSelections: 2,
      required: false,
      allowDuplicates: true,
      variants: [
        {
          shopifyVariantId: "gid://shopify/ProductVariant/2",
          titleCache: "Melt A",
          imageCache: null,
          priceCache: 8,
        },
      ],
    },
  ],
};

describe("buildGroupedMixMatchBundlesDisplay", () => {
  it("keys the map by offer id and carries the groups verbatim", () => {
    const display = buildGroupedMixMatchBundlesDisplay([GROUPED_OFFER]);
    expect(Object.keys(display)).toEqual(["off_grouped_1"]);
    expect(display.off_grouped_1.groups).toHaveLength(2);
    expect(display.off_grouped_1.groups?.[0]).toEqual({
      id: "grp_candle",
      name: "Candle",
      description: null,
      minSelections: 1,
      maxSelections: 1,
      required: true,
      allowDuplicates: false,
      products: [
        { variantId: "gid://shopify/ProductVariant/1", title: "Candle A", imageUrl: null, price: 20 },
      ],
    });
  });

  it("derives minItems/maxItems from the groups (required floor, every group's ceiling)", () => {
    const display = buildGroupedMixMatchBundlesDisplay([GROUPED_OFFER]);
    expect(display.off_grouped_1.minItems).toBe(1);
    expect(display.off_grouped_1.maxItems).toBe(3);
  });

  it("leaves the flat products array empty for a grouped entry", () => {
    const display = buildGroupedMixMatchBundlesDisplay([GROUPED_OFFER]);
    expect(display.off_grouped_1.products).toEqual([]);
  });

  it("produces an empty map for no active grouped offers", () => {
    expect(buildGroupedMixMatchBundlesDisplay([])).toEqual({});
  });
});
