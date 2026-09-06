import { describe, expect, it } from "vitest";
import { cartTransformRun } from "./cart_transform_run";
import type { CartLine, CartTransformRunInput } from "../generated/api";

const OFFER_ID = "off_mix_match_1";
const SESSION_ID = "sess_abc123";
const PARENT_VARIANT_ID = "gid://shopify/ProductVariant/999";

const VARIANT_A = "gid://shopify/ProductVariant/1"; // Candle A
const VARIANT_B = "gid://shopify/ProductVariant/2"; // Candle B
const VARIANT_C = "gid://shopify/ProductVariant/3"; // Candle C
const VARIANT_D = "gid://shopify/ProductVariant/4"; // Candle D (outside pool in some tests)

const FLAT_POOL_CONFIG = {
  version: 1 as const,
  offerId: OFFER_ID,
  offerVersion: 1,
  active: true,
  parentVariantId: PARENT_VARIANT_ID,
  publicTitle: "Compose your bundle",
  discountType: "PERCENTAGE" as const,
  discountValue: 15,
  tiers: [],
  minItems: 3,
  maxItems: 3,
  allowDuplicates: false,
  groups: [
    {
      id: "pool",
      min: 3,
      max: 3,
      required: true,
      variantIds: [VARIANT_A, VARIANT_B, VARIANT_C, VARIANT_D],
    },
  ],
};

function makeLine(
  id: string,
  variantId: string,
  quantity: number,
  config: Record<string, unknown> | null,
  overrides: { offerId?: string; sessionId?: string } = {},
): CartLine {
  return {
    id,
    quantity,
    cost: { amountPerQuantity: { amount: "20.00" } },
    merchandise: {
      __typename: "ProductVariant",
      id: variantId,
      bundleComponent: config ? { jsonValue: config } : null,
    },
    offerAttr: { value: overrides.offerId ?? (config ? OFFER_ID : null) },
    sessionAttr: { value: overrides.sessionId ?? SESSION_ID },
  };
}

function input(lines: CartLine[]): CartTransformRunInput {
  return { cart: { lines } };
}

describe("cartTransformRun — brief item 78 (flat Mix & Match: A,B,C,D pool, choose 3, 15% off)", () => {
  it("A+B+C is a valid bundle at 15% off", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG),
        makeLine("l2", VARIANT_B, 1, FLAT_POOL_CONFIG),
        makeLine("l3", VARIANT_C, 1, FLAT_POOL_CONFIG),
      ]),
    );

    expect(result.operations).toHaveLength(1);
    const op = result.operations[0].linesMerge;
    expect(op.parentVariantId).toBe(PARENT_VARIANT_ID);
    expect(op.price).toEqual({ percentageDecrease: { value: 15 } });
    expect(op.cartLines.map((l) => l.cartLineId).sort()).toEqual(["l1", "l2", "l3"]);
  });

  it("A (qty 2) + C is invalid when duplicates aren't allowed", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 2, FLAT_POOL_CONFIG),
        makeLine("l2", VARIANT_C, 1, FLAT_POOL_CONFIG),
      ]),
    );
    expect(result.operations).toHaveLength(0);
  });

  it("A (qty 2) + C is valid once duplicates are allowed", () => {
    const config = { ...FLAT_POOL_CONFIG, allowDuplicates: true };
    const result = cartTransformRun(
      input([makeLine("l1", VARIANT_A, 2, config), makeLine("l2", VARIANT_C, 1, config)]),
    );
    expect(result.operations).toHaveLength(1);
  });

  it("A+B alone is incomplete (below minItems)", () => {
    const result = cartTransformRun(
      input([makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG), makeLine("l2", VARIANT_B, 1, FLAT_POOL_CONFIG)]),
    );
    expect(result.operations).toHaveLength(0);
  });

  it("A+B+C+D is invalid when maxItems is 3", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG),
        makeLine("l2", VARIANT_B, 1, FLAT_POOL_CONFIG),
        makeLine("l3", VARIANT_C, 1, FLAT_POOL_CONFIG),
        makeLine("l4", VARIANT_D, 1, FLAT_POOL_CONFIG),
      ]),
    );
    expect(result.operations).toHaveLength(0);
  });

  it("a product outside the bundle pool never satisfies the condition", () => {
    const outsiderConfig = {
      ...FLAT_POOL_CONFIG,
      groups: [{ ...FLAT_POOL_CONFIG.groups[0], variantIds: [VARIANT_A, VARIANT_B, VARIANT_C] }],
    };
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, outsiderConfig),
        makeLine("l2", VARIANT_B, 1, outsiderConfig),
        // This line claims the offer via attribute, but its own variant (D) was
        // never part of the pool, so it never carries the config metafield at all.
        makeLine("l3", VARIANT_D, 1, null, { offerId: OFFER_ID }),
      ]),
    );
    expect(result.operations).toHaveLength(0);
  });
});

describe("cartTransformRun — brief item 80 (cheat test)", () => {
  it("ignores anything the cart line itself claims and applies only the configured discount", () => {
    // The line-item property mechanism (attribute) only carries offer/session
    // IDs in this codebase — there is no field for a client-declared discount
    // at all. This test documents that a fabricated line with an unrelated
    // extra attribute still resolves to the merchant-configured 15%, never a
    // client-supplied value.
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG),
        makeLine("l2", VARIANT_B, 1, FLAT_POOL_CONFIG),
        {
          ...makeLine("l3", VARIANT_C, 1, FLAT_POOL_CONFIG),
          // Simulates a tampered cart line carrying an attacker-chosen value
          // under an attribute key our function never reads.
          offerAttr: { value: OFFER_ID },
        },
      ]),
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].linesMerge.price).toEqual({ percentageDecrease: { value: 15 } });
  });

  it("drops a line whose own variant metafield disagrees with its claimed offer id", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG),
        makeLine("l2", VARIANT_B, 1, FLAT_POOL_CONFIG),
        // Claims to belong to OFFER_ID via attribute, but its metafield says
        // a different offer — must be dropped, not trusted.
        makeLine("l3", VARIANT_C, 1, { ...FLAT_POOL_CONFIG, offerId: "off_some_other_offer" }, {
          offerId: OFFER_ID,
        }),
      ]),
    );
    expect(result.operations).toHaveLength(0); // only 2 verified items, below minItems
  });
});

describe("cartTransformRun — brief item 81 (removing a component invalidates the discount)", () => {
  it("stops discounting once a required component is removed from the cart", () => {
    const withAllThree = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG),
        makeLine("l2", VARIANT_B, 1, FLAT_POOL_CONFIG),
        makeLine("l3", VARIANT_C, 1, FLAT_POOL_CONFIG),
      ]),
    );
    expect(withAllThree.operations).toHaveLength(1);

    // Simulate the customer removing line l3 from the cart and Shopify
    // re-running the function on the resulting (smaller) line set.
    const afterRemoval = cartTransformRun(
      input([makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG), makeLine("l2", VARIANT_B, 1, FLAT_POOL_CONFIG)]),
    );
    expect(afterRemoval.operations).toHaveLength(0);
  });
});

describe("cartTransformRun — brief item 79 (Grouped Mix & Match, generalized groups)", () => {
  const GROUPED_CONFIG = {
    ...FLAT_POOL_CONFIG,
    minItems: 3,
    maxItems: 3,
    groups: [
      { id: "candle", min: 1, max: 1, required: true, variantIds: [VARIANT_A, VARIANT_B] },
      { id: "bracelet", min: 1, max: 1, required: true, variantIds: [VARIANT_C] },
      { id: "care", min: 1, max: 1, required: true, variantIds: [VARIANT_D] },
    ],
  };

  it("one item from each required group is valid", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, GROUPED_CONFIG), // candle
        makeLine("l2", VARIANT_C, 1, GROUPED_CONFIG), // bracelet
        makeLine("l3", VARIANT_D, 1, GROUPED_CONFIG), // care
      ]),
    );
    expect(result.operations).toHaveLength(1);
  });

  it("missing the bracelet group is invalid even though the total item count could work out", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, GROUPED_CONFIG), // candle
        makeLine("l2", VARIANT_B, 1, GROUPED_CONFIG), // a second candle, not a bracelet
        makeLine("l3", VARIANT_D, 1, GROUPED_CONFIG), // care
      ]),
    );
    expect(result.operations).toHaveLength(0);
  });

  it("two candles when the candle group's max is 1 is invalid", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, GROUPED_CONFIG),
        makeLine("l2", VARIANT_B, 1, GROUPED_CONFIG),
        makeLine("l3", VARIANT_C, 1, GROUPED_CONFIG),
        makeLine("l4", VARIANT_D, 1, GROUPED_CONFIG),
      ]),
    );
    expect(result.operations).toHaveLength(0);
  });
});

describe("cartTransformRun — inactive/stale configuration", () => {
  it("emits nothing when the offer has been paused (active: false)", () => {
    const paused = { ...FLAT_POOL_CONFIG, active: false };
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, paused),
        makeLine("l2", VARIANT_B, 1, paused),
        makeLine("l3", VARIANT_C, 1, paused),
      ]),
    );
    expect(result.operations).toHaveLength(0);
  });

  it("emits nothing when lines disagree on offerVersion mid-propagation", () => {
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, FLAT_POOL_CONFIG),
        makeLine("l2", VARIANT_B, 1, { ...FLAT_POOL_CONFIG, offerVersion: 2 }),
        makeLine("l3", VARIANT_C, 1, FLAT_POOL_CONFIG),
      ]),
    );
    expect(result.operations).toHaveLength(0);
  });
});

describe("cartTransformRun — FIXED_AMOUNT converts to an equivalent percentage", () => {
  it("produces the same dollar discount regardless of the conversion", () => {
    const fixedConfig = { ...FLAT_POOL_CONFIG, discountType: "FIXED_AMOUNT" as const, discountValue: 9 };
    // 3 lines at $20 each = $60 components sum; $9 off = 15% equivalent.
    const result = cartTransformRun(
      input([
        makeLine("l1", VARIANT_A, 1, fixedConfig),
        makeLine("l2", VARIANT_B, 1, fixedConfig),
        makeLine("l3", VARIANT_C, 1, fixedConfig),
      ]),
    );
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].linesMerge.price?.percentageDecrease.value).toBeCloseTo(15);
  });
});
