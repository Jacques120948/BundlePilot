/**
 * Builds the two JSON payloads a published Quantity Break offer needs on
 * the Shopify side:
 *
 * - `functionConfiguration`: written to the discount's own metafield, read
 *   by the Discount Function's input query. This is the *enforcement*
 *   config — see docs/DISCOUNT_ENGINE.md.
 * - `displayConfiguration`: written to a storefront-readable metafield on
 *   each covered product, read by the Theme App Extension block purely for
 *   rendering. This is *never* consumed by the Function — see
 *   docs/DISCOUNT_ENGINE.md "Storefront display metafield".
 *
 * Kept pure (no Prisma/GraphQL imports) so both shapes are trivially
 * unit-testable.
 */

export interface QuantityBreakTierData {
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  label?: string | null;
}

export interface FunctionConfiguration {
  version: 1;
  productIds: string[];
  tiers: {
    quantity: number;
    discountType: "PERCENTAGE" | "FIXED_AMOUNT";
    discountValue: number;
  }[];
}

export interface DisplayConfiguration {
  offerId: string;
  publicTitle: string;
  tiers: {
    quantity: number;
    discountType: "PERCENTAGE" | "FIXED_AMOUNT";
    discountValue: number;
    label: string | null;
  }[];
}

export function buildFunctionConfiguration(
  productIds: string[],
  tiers: QuantityBreakTierData[],
): FunctionConfiguration {
  return {
    version: 1,
    productIds,
    tiers: [...tiers]
      .sort((a, b) => a.quantity - b.quantity)
      .map((t) => ({
        quantity: t.quantity,
        discountType: t.discountType,
        discountValue: t.discountValue,
      })),
  };
}

export function buildDisplayConfiguration(
  offerId: string,
  publicTitle: string,
  tiers: QuantityBreakTierData[],
): DisplayConfiguration {
  return {
    offerId,
    publicTitle,
    tiers: [...tiers]
      .sort((a, b) => a.quantity - b.quantity)
      .map((t) => ({
        quantity: t.quantity,
        discountType: t.discountType,
        discountValue: t.discountValue,
        label: t.label ?? null,
      })),
  };
}
