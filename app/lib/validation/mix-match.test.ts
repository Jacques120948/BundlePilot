import { describe, expect, it } from "vitest";
import { validateMixMatchOffer } from "./mix-match";
import type { MixMatchOfferInput } from "./mix-match";

function baseInput(overrides: Partial<MixMatchOfferInput> = {}): MixMatchOfferInput {
  return {
    name: "Build your coffret",
    publicTitle: "Compose your bundle",
    variantIds: [
      "gid://shopify/ProductVariant/1",
      "gid://shopify/ProductVariant/2",
      "gid://shopify/ProductVariant/3",
      "gid://shopify/ProductVariant/4",
    ],
    minItems: 3,
    maxItems: 3,
    allowDuplicates: false,
    discountType: "PERCENTAGE",
    discountValue: 15,
    tiers: [],
    ...overrides,
  };
}

describe("validateMixMatchOffer", () => {
  it("accepts a well-formed offer", () => {
    expect(validateMixMatchOffer(baseInput())).toEqual({ valid: true, errors: [] });
  });

  it("rejects an empty pool", () => {
    const result = validateMixMatchOffer(baseInput({ variantIds: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Add at least one product or variant to the pool.");
  });

  it("rejects the same variant selected twice in the pool", () => {
    const result = validateMixMatchOffer(
      baseInput({ variantIds: ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/1"] }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects min > max", () => {
    const result = validateMixMatchOffer(baseInput({ minItems: 5, maxItems: 3 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Minimum selection can't be greater than maximum selection.");
  });

  it("rejects the brief's worked example: 3 required, only 2 unique products, no duplicates", () => {
    const result = validateMixMatchOffer(
      baseInput({
        variantIds: ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/2"],
        minItems: 3,
        maxItems: 3,
        allowDuplicates: false,
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("only 2 unique product"))).toBe(true);
  });

  it("allows the same uncompletable pool once duplicates are allowed", () => {
    const result = validateMixMatchOffer(
      baseInput({
        variantIds: ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/2"],
        minItems: 3,
        maxItems: 3,
        allowDuplicates: true,
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects specifying both a flat discount and tiers", () => {
    const result = validateMixMatchOffer(
      baseInput({
        tiers: [{ quantity: 3, discountType: "PERCENTAGE", discountValue: 15 }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Use either a single discount or tiers, not both.");
  });

  it("requires either a flat discount or tiers", () => {
    const result = validateMixMatchOffer(
      baseInput({ discountType: null, discountValue: null, tiers: [] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Set a discount, or add at least one tier.");
  });

  it("accepts tiers instead of a flat discount", () => {
    const result = validateMixMatchOffer(
      baseInput({
        discountType: null,
        discountValue: null,
        minItems: 2,
        maxItems: 4,
        tiers: [
          { quantity: 2, discountType: "PERCENTAGE", discountValue: 10 },
          { quantity: 3, discountType: "PERCENTAGE", discountValue: 15 },
          { quantity: 4, discountType: "PERCENTAGE", discountValue: 20 },
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a percentage discount over 100%", () => {
    const result = validateMixMatchOffer(baseInput({ discountValue: 150 }));
    expect(result.valid).toBe(false);
  });
});
