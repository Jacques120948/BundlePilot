import { describe, expect, it } from "vitest";
import { buildMixMatchBundlesDisplay } from "./mix-match-display-config";
import type { MixMatchOfferForDisplay } from "./mix-match-display-config";

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
