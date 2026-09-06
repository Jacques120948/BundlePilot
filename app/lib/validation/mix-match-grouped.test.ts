import { describe, expect, it } from "vitest";
import { validateMixMatchGroupedOffer } from "./mix-match-grouped";
import type { MixMatchGroupedOfferInput, MixMatchGroupedGroupInput } from "./mix-match-grouped";

function baseGroup(overrides: Partial<MixMatchGroupedGroupInput> = {}): MixMatchGroupedGroupInput {
  return {
    name: "Candle",
    minSelections: 1,
    maxSelections: 1,
    required: true,
    allowDuplicates: false,
    variantIds: ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/2"],
    ...overrides,
  };
}

function baseInput(overrides: Partial<MixMatchGroupedOfferInput> = {}): MixMatchGroupedOfferInput {
  return {
    name: "Build your gift set",
    publicTitle: "Build your gift set",
    groups: [
      baseGroup(),
      baseGroup({ name: "Bracelet", variantIds: ["gid://shopify/ProductVariant/3"] }),
    ],
    discountType: "PERCENTAGE",
    discountValue: 20,
    tiers: [],
    ...overrides,
  };
}

describe("validateMixMatchGroupedOffer", () => {
  it("accepts a well-formed grouped offer", () => {
    expect(validateMixMatchGroupedOffer(baseInput())).toEqual({ valid: true, errors: [] });
  });

  it("rejects an offer with no groups", () => {
    const result = validateMixMatchGroupedOffer(baseInput({ groups: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least one group"))).toBe(true);
  });

  it("rejects more than 10 groups", () => {
    const groups = Array.from({ length: 11 }, (_, i) =>
      baseGroup({ name: `Group ${i}`, variantIds: [`gid://shopify/ProductVariant/${i}`] }),
    );
    const result = validateMixMatchGroupedOffer(baseInput({ groups }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at most 10 groups"))).toBe(true);
  });

  it("rejects a group with no name", () => {
    const result = validateMixMatchGroupedOffer(baseInput({ groups: [baseGroup({ name: "" })] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("needs a name"))).toBe(true);
  });

  it("rejects duplicate group names", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({ groups: [baseGroup({ name: "Candle" }), baseGroup({ name: "Candle" })] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("used more than once"))).toBe(true);
  });

  it("rejects a required group with minSelections 0", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({ groups: [baseGroup({ required: true, minSelections: 0 })] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("required group needs a minimum"))).toBe(true);
  });

  it("allows an optional group with minSelections 0", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({
        groups: [baseGroup({ required: false, minSelections: 0, maxSelections: 2 })],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects min > max within a group", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({ groups: [baseGroup({ minSelections: 2, maxSelections: 1 })] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("can't be greater than maximum"))).toBe(true);
  });

  it("rejects an empty group pool", () => {
    const result = validateMixMatchGroupedOffer(baseInput({ groups: [baseGroup({ variantIds: [] })] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("add at least one product"))).toBe(true);
  });

  it("rejects the worked example within a group: max 2, only 1 unique product, no duplicates", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({
        groups: [
          baseGroup({
            maxSelections: 2,
            allowDuplicates: false,
            variantIds: ["gid://shopify/ProductVariant/1"],
          }),
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("only 1 unique product"))).toBe(true);
  });

  it("allows that same uncompletable group once duplicates are allowed", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({
        groups: [
          baseGroup({
            maxSelections: 2,
            allowDuplicates: true,
            variantIds: ["gid://shopify/ProductVariant/1"],
          }),
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects the same variant placed in two different groups", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({
        groups: [
          baseGroup({ name: "A", variantIds: ["gid://shopify/ProductVariant/1"] }),
          baseGroup({ name: "B", variantIds: ["gid://shopify/ProductVariant/1"] }),
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("more than one group"))).toBe(true);
  });

  it("rejects specifying both a flat discount and tiers", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({ tiers: [{ quantity: 2, discountType: "PERCENTAGE", discountValue: 15 }] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Use either a single discount or tiers, not both.");
  });

  it("requires either a flat discount or tiers", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({ discountType: null, discountValue: null, tiers: [] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Set a discount, or add at least one tier.");
  });

  it("accepts tiers instead of a flat discount", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({
        discountType: null,
        discountValue: null,
        tiers: [
          { quantity: 2, discountType: "PERCENTAGE", discountValue: 10 },
          { quantity: 3, discountType: "PERCENTAGE", discountValue: 15 },
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a percentage discount over 100%", () => {
    const result = validateMixMatchGroupedOffer(baseInput({ discountValue: 150 }));
    expect(result.valid).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = validateMixMatchGroupedOffer(
      baseInput({ startsAt: new Date("2026-02-01"), endsAt: new Date("2026-01-01") }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("End date must be after the start date.");
  });
});
