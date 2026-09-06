/**
 * OfferType is intentionally kept as a small, closed set for V1.
 *
 * See docs/BUNDLE_ARCHITECTURE.md "Extending OfferType" for how to add
 * FIXED_BUNDLE, BOGO, FREE_GIFT, or FREQUENTLY_BOUGHT_TOGETHER later without
 * restructuring the Offer table: each new type gets its own optional
 * sub-tables (like BundleGroup today) and a branch in the admin builder +
 * the relevant Shopify Function, but the Offer/OfferProduct/OfferVariant
 * spine stays the same.
 */
export const OFFER_TYPES = [
  "QUANTITY_BREAK",
  "MIX_MATCH",
  "MIX_MATCH_GROUPED",
] as const;

export type OfferTypeValue = (typeof OFFER_TYPES)[number];

export const OFFER_TYPE_LABELS: Record<OfferTypeValue, string> = {
  QUANTITY_BREAK: "Quantity Break",
  MIX_MATCH: "Mix & Match",
  MIX_MATCH_GROUPED: "Grouped Mix & Match",
};

/**
 * Which Shopify mechanism enforces the discount for each offer type.
 * Both mechanisms are Shopify Functions; neither trusts client-supplied
 * discount amounts. See docs/DISCOUNT_ENGINE.md and docs/CART_TRANSFORM.md.
 */
export const OFFER_TYPE_ENFORCEMENT: Record<
  OfferTypeValue,
  "discount-function" | "cart-transform-function"
> = {
  QUANTITY_BREAK: "discount-function",
  MIX_MATCH: "cart-transform-function",
  MIX_MATCH_GROUPED: "cart-transform-function",
};
