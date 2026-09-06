import { describe, expect, it } from "vitest";
import { validateQuantityBreakOffer } from "./quantity-break";
import type { QuantityBreakOfferInput } from "./quantity-break";

function baseInput(overrides: Partial<QuantityBreakOfferInput> = {}): QuantityBreakOfferInput {
  return {
    name: "Buy more candles",
    publicTitle: "Buy more & save",
    productIds: ["gid://shopify/Product/1"],
    tiers: [
      { quantity: 1, discountType: "PERCENTAGE", discountValue: 0 },
      { quantity: 2, discountType: "PERCENTAGE", discountValue: 10 },
      { quantity: 3, discountType: "PERCENTAGE", discountValue: 15 },
      { quantity: 4, discountType: "PERCENTAGE", discountValue: 20 },
    ],
    ...overrides,
  };
}

describe("validateQuantityBreakOffer", () => {
  it("accepts a well-formed offer", () => {
    expect(validateQuantityBreakOffer(baseInput())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects an offer with no products selected", () => {
    const result = validateQuantityBreakOffer(baseInput({ productIds: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Select at least one product.");
  });

  it("rejects an offer with no tiers", () => {
    const result = validateQuantityBreakOffer(baseInput({ tiers: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Add at least one quantity tier.");
  });

  it("rejects a percentage discount over 100%", () => {
    const result = validateQuantityBreakOffer(
      baseInput({
        tiers: [{ quantity: 1, discountType: "PERCENTAGE", discountValue: 150 }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("can't exceed 100%"))).toBe(true);
  });

  it("rejects a negative discount value", () => {
    const result = validateQuantityBreakOffer(
      baseInput({
        tiers: [{ quantity: 1, discountType: "FIXED_AMOUNT", discountValue: -5 }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("can't be negative"))).toBe(true);
  });

  it("rejects duplicate tier quantities", () => {
    const result = validateQuantityBreakOffer(
      baseInput({
        tiers: [
          { quantity: 2, discountType: "PERCENTAGE", discountValue: 10 },
          { quantity: 2, discountType: "PERCENTAGE", discountValue: 15 },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate tier"))).toBe(true);
  });

  it("rejects a non-positive or non-integer quantity", () => {
    const result = validateQuantityBreakOffer(
      baseInput({
        tiers: [{ quantity: 0, discountType: "PERCENTAGE", discountValue: 10 }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = validateQuantityBreakOffer(
      baseInput({
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-05-01"),
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("End date must be after the start date.");
  });
});
