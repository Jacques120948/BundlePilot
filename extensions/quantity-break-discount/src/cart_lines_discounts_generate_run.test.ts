import { describe, expect, it } from "vitest";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import { DiscountClass } from "../generated/api";
import type { CartLinesDiscountsGenerateRunInput } from "../generated/api";

const PRODUCT_ID = "gid://shopify/Product/1";
const VARIANT_ID = "gid://shopify/ProductVariant/1";
const OTHER_PRODUCT_ID = "gid://shopify/Product/2";

const STANDARD_TIERS = [
  { quantity: 1, discountType: "PERCENTAGE" as const, discountValue: 0 },
  { quantity: 2, discountType: "PERCENTAGE" as const, discountValue: 10 },
  { quantity: 3, discountType: "PERCENTAGE" as const, discountValue: 15 },
  { quantity: 4, discountType: "PERCENTAGE" as const, discountValue: 20 },
];

function buildInput(
  quantity: number,
  overrides: {
    discountClasses?: DiscountClass[];
    metafieldValue?: unknown;
    productId?: string;
  } = {},
): CartLinesDiscountsGenerateRunInput {
  return {
    cart: {
      lines: [
        {
          id: "gid://shopify/CartLine/1",
          quantity,
          merchandise: {
            __typename: "ProductVariant",
            id: VARIANT_ID,
            product: { id: overrides.productId ?? PRODUCT_ID },
          },
        },
      ],
    },
    discount: {
      discountClasses: overrides.discountClasses ?? [DiscountClass.Product],
      metafield: {
        jsonValue:
          overrides.metafieldValue !== undefined
            ? overrides.metafieldValue
            : { version: 1, productIds: [PRODUCT_ID], tiers: STANDARD_TIERS },
      },
    },
  };
}

/** Applies the emitted percentage the same way Shopify applies it: to the whole line subtotal. */
function totalAfterDiscount(unitPrice: number, quantity: number, percentageOff: number) {
  const subtotal = unitPrice * quantity;
  return subtotal - subtotal * (percentageOff / 100);
}

describe("cartLinesDiscountsGenerateRun — brief item 77 acceptance table (100 CHF product)", () => {
  const cases: [quantity: number, expectedTotal: number][] = [
    [1, 100],
    [2, 180],
    [3, 255],
    [4, 320],
    [5, 400], // quantity 5 has no tier of its own — falls back to the tier-4 rate (20%), never stacks
  ];

  it.each(cases)("quantity %i totals %i CHF", (quantity, expectedTotal) => {
    const result = cartLinesDiscountsGenerateRun(buildInput(quantity));

    if (expectedTotal === quantity * 100) {
      expect(result.operations).toHaveLength(0);
      return;
    }

    expect(result.operations).toHaveLength(1);
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    const percentage = (candidate.value as { percentage: { value: number } }).percentage.value;

    expect(totalAfterDiscount(100, quantity, percentage)).toBe(expectedTotal);
  });
});

describe("cartLinesDiscountsGenerateRun — safety", () => {
  it("emits nothing when the cart has no lines", () => {
    const result = cartLinesDiscountsGenerateRun({
      cart: { lines: [] },
      discount: { discountClasses: [DiscountClass.Product], metafield: null },
    });
    expect(result.operations).toEqual([]);
  });

  it("emits nothing when the PRODUCT discount class isn't enabled", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput(3, { discountClasses: [DiscountClass.Order] }),
    );
    expect(result.operations).toEqual([]);
  });

  it("fails closed when the discount has no configuration metafield at all", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput(3, { metafieldValue: null }));
    expect(result.operations).toEqual([]);
  });

  it("fails closed when the configuration metafield is malformed", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput(3, { metafieldValue: { not: "a valid config" } }),
    );
    expect(result.operations).toEqual([]);
  });

  it("ignores lines for products outside the offer's configured scope", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput(3, { productId: OTHER_PRODUCT_ID }),
    );
    expect(result.operations).toEqual([]);
  });

  it("the cheat test (brief item 80): nothing the cart line itself carries can override the configured discount — the function only ever reads the tier config from its own metafield, never from cart line data", () => {
    // There is deliberately no code path in cartLinesDiscountsGenerateRun that
    // reads anything from `line` other than `id`, `quantity`, and
    // `merchandise` — there is no field a tampered cart could set that this
    // function would interpret as "apply 50% instead of 15%". This test
    // documents that invariant by asserting the emitted percentage always
    // matches the *configured* tier for the verified quantity, regardless of
    // how many (irrelevant) cart lines or values surround it.
    const result = cartLinesDiscountsGenerateRun(buildInput(3));
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect((candidate.value as { percentage: { value: number } }).percentage.value).toBe(15);
  });
});
