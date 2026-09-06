# Bundle product model

Answers: does BundlePilot need to create a "bundle parent product" in the
merchant's catalog?

## Decision: no bundle parent product in V1

Shopify's native bundle framework supports two shapes:

- **Fixed bundles**: a real parent product/variant with `requiresComponents`,
  where the *customer* picks nothing (or only Shopify-native variant
  options) — checkout adds the parent, Shopify expands it to components.
- **Customized bundles**: the *app* is responsible for the storefront
  picker, and the parent is typically a `linesMerge` **synthetic** grouping
  produced by the Cart Transform function at cart time, not a catalog
  product the merchant manages.

BundlePilot's Mix & Match is explicitly the second case — the merchant
picks a pool/groups, the *customer* composes the bundle in the storefront
widget. There is no fixed combination to model as a standing product, and
creating one real "parent" product per possible combination is combinatorially
infeasible (a 3-of-8 pool alone has 56 combinations). So V1 uses
`linesMerge` to create the grouped line **only when the cart already
contains a valid combination**, with no catalog-visible parent product at
all — satisfying brief item 20 ("don't clutter the merchant's catalog with
visible products").

Quantity Break needs no parent product either — the existing product/variant
*is* the whole offer.

## When a parent product would become necessary

If `FIXED_BUNDLE_PRICE` ships later (docs/BUNDLE_ARCHITECTURE.md "Discount
types") using Shopify's native Fixed Bundle mechanism instead of a Cart
Transform-computed price, that flow does need a real parent product per
saved bundle. At that point:

- The app would create one draft, unpublished (or minimally published)
  product per Mix & Match offer, with `requiresComponents = true` and the
  chosen component variants attached via `productVariantRelationshipBulkUpdate`
  (or the then-current equivalent — verify against shopify.dev before
  implementing).
- That product would be hidden from the online store's default collections/
  navigation (not published to the Online Store channel, or excluded via
  the theme) so it doesn't appear as a duplicate, purchasable-standalone
  product.
- This is out of scope until FIXED_BUNDLE_PRICE is greenlit; tracked in
  docs/ROADMAP.md Phase 2+.

## Metafield namespace ownership

All BundlePilot metafields/metaobjects use the reserved `$app` namespace
prefix (resolves to an app-owned namespace unique per app, per Shopify's
metafield conventions) so no other app or merchant edit can collide with
our data. Locally, `app/lib/branding.ts#METAFIELD_NAMESPACE` documents the
literal string used in code for readability; the functional namespace at
the API level is always the `$app:` reserved prefix, not a manually chosen
string, to get Shopify's collision guarantees.

| Owner | Namespace.key | Type | Purpose |
|---|---|---|---|
| ProductVariant | `$app:bundle_component` | json | Denormalized Mix & Match / Grouped offer config (docs/MIX_MATCH_ENGINE.md) |
| Discount (`discountAutomaticApp`) | `$app:function-configuration` | json | Quantity Break tier config (docs/DISCOUNT_ENGINE.md) |

No metafields are written on `Shop`, `Customer`, or `Order` in V1.
