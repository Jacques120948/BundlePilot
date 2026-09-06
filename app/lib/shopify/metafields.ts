/**
 * BundlePilot's metafield namespace and keys. See
 * docs/BUNDLE_PRODUCT_MODEL.md "Metafield namespace ownership".
 *
 * `"$app"` is Shopify's reserved app-owned namespace: Shopify resolves it
 * server-side to a namespace unique to this app installation, so it can be
 * used verbatim in every shop without collision — no per-app string to
 * configure. Liquid reads it back via the `app` accessor
 * (`product.metafields.app.<key>`), independent of this constant.
 */
export const METAFIELD_NAMESPACE_APP = "$app";

export const METAFIELD_KEYS = {
  /** On the Discount node — read by the Discount Function. Never storefront-readable. */
  quantityBreakFunctionConfiguration: "function-configuration",
  /** On each covered Product — read by the Theme App Extension for display only. */
  quantityBreakDisplay: "quantity-break-display",
  /** On each Mix & Match component ProductVariant — read by the Cart Transform Function. */
  bundleComponent: "bundle-component",
  /** On the Shop — read by the Theme App Extension's Mix & Match builder block for display only. */
  mixMatchBundlesDisplay: "mix-match-bundles",
} as const;
