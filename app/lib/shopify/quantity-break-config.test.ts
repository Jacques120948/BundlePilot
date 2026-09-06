import { describe, expect, it } from "vitest";
import {
  buildFunctionConfiguration,
  buildDisplayConfiguration,
} from "./quantity-break-config";

describe("buildFunctionConfiguration", () => {
  it("sorts tiers by quantity ascending regardless of input order", () => {
    const config = buildFunctionConfiguration(
      ["gid://shopify/Product/1"],
      [
        { quantity: 3, discountType: "PERCENTAGE", discountValue: 15 },
        { quantity: 1, discountType: "PERCENTAGE", discountValue: 0 },
        { quantity: 2, discountType: "PERCENTAGE", discountValue: 10 },
      ],
    );

    expect(config.tiers.map((t) => t.quantity)).toEqual([1, 2, 3]);
    expect(config.version).toBe(1);
    expect(config.productIds).toEqual(["gid://shopify/Product/1"]);
  });

  it("drops the label field — the function never needs display text", () => {
    const config = buildFunctionConfiguration(
      [],
      [{ quantity: 1, discountType: "PERCENTAGE", discountValue: 0, label: "Best value" }],
    );
    expect(config.tiers[0]).not.toHaveProperty("label");
  });
});

describe("buildDisplayConfiguration", () => {
  it("keeps labels for storefront rendering", () => {
    const config = buildDisplayConfiguration("off_1", "Buy more & save", [
      { quantity: 3, discountType: "PERCENTAGE", discountValue: 15, label: "Best value" },
    ]);
    expect(config.offerId).toBe("off_1");
    expect(config.tiers[0].label).toBe("Best value");
  });

  it("defaults a missing label to null rather than undefined", () => {
    const config = buildDisplayConfiguration("off_1", "Buy more & save", [
      { quantity: 1, discountType: "PERCENTAGE", discountValue: 0 },
    ]);
    expect(config.tiers[0].label).toBeNull();
  });
});
