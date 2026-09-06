# Bundle architecture

How `Offer` and its child tables (prisma/schema.prisma) model the three V1
offer types, and the admin lifecycle around them.

## The Offer spine

Every offer type shares: `name`/`publicTitle`/`description`, `status`,
`startsAt`/`endsAt`, `combinesWith*`, and a product **selection mode**
(`MANUAL` or `COLLECTION`, brief items 9-10). Type-specific structure is
additive:

| Type | Uses `OfferTier`? | Uses `BundleGroup`? | Product pool |
|---|---|---|---|
| `QUANTITY_BREAK` | Yes (quantity → discount) | No | `OfferProduct`/`OfferVariant` directly on the offer |
| `MIX_MATCH` | Optional (item-count → discount tiers) | No | `OfferProduct`/`OfferVariant` directly on the offer (one flat pool) |
| `MIX_MATCH_GROUPED` | No (each group has its own rule) | Yes, 1+ | `BundleGroupProduct` per group |

This is why `OfferProduct`/`OfferVariant` have optional `bundleGroupId`
columns: for grouped bundles the same tables are scoped per-group instead of
per-offer, without needing a separate table per offer type.

## Selection mode (manual vs. collection)

`selectionMode = COLLECTION` stores `sourceCollectionId` and treats the
collection's current membership as the pool, refreshed at publish/edit time
into `OfferProduct` rows (cached, not live — see docs/DATABASE.md
"Caching Shopify data"). `OfferProduct.excluded` lets the merchant remove
specific products a collection would otherwise include (brief item 10,
"always provide manual exclusions"). `selectionMode = MANUAL` uses the
Admin Resource Picker (`shopify.resourcePicker({ type: 'product' |
'variant', multiple: true })`) with no collection dependency at all — a
merchant is never forced to create a collection to use BundlePilot (brief
item 2).

## Discount types

- `PERCENTAGE`, `FIXED_AMOUNT`: implemented in V1 for all three offer
  types.
- `FIXED_BUNDLE_PRICE`: **deferred**. Setting an absolute bundle price
  correctly requires: per-presentment-currency pricing (Shopify Markets),
  correct tax treatment when the sum-of-components price differs from the
  fixed price, and rounding behavior that stays consistent between the
  storefront preview and the actual checkout total. Shopify's Cart
  Transform `ExpandOperation` *can* set fixed per-component prices summing
  to a bundle price, but verifying this holds correctly across Markets/tax
  is a dedicated verification task we are not doing before V1 ships
  Percentage + Fixed Amount, per brief item 16's explicit "if this
  complicates V1 excessively, implement Percentage + Fixed Amount first and
  document the decision" — this *is* that documentation. Revisit in a
  post-V1 phase with real multi-currency test stores.

## Combination rules

`combinesWithProductDiscounts`/`combinesWithOrderDiscounts`/
`combinesWithShippingDiscounts` on `Offer` map 1:1 to Shopify's
`DiscountCombinesWith` for Quantity Break (docs/DISCOUNT_ENGINE.md) and are
informational-only metadata for Mix & Match today, since a `linesMerge`
bundle line's interaction with *other* app discounts on the same line is
Shopify-determined by the Multiple Operations resolution order
(docs/BUNDLE_LIMITATIONS.md), not a combinesWith setting — Cart Transform
doesn't expose a combinesWith knob the way Discount Functions do. Default:
shipping discounts combine (on), product/order discounts don't (off),
matching Shopify's own defaults for automatic discounts.

## Admin validation (brief item 34)

Enforced server-side before allowing `status` to move to `ACTIVE` or
`SCHEDULED` (never only client-side):

- quantity/discount value bounds: `quantity > 0`, `0 < discountValue`,
  and `discountValue <= 100` for `PERCENTAGE`.
- every required `BundleGroup` has `minSelections >= 1` and at least
  `minSelections` *unique* selectable products/variants (accounting for
  `allowDuplicates`) — otherwise the bundle is uncompletable, per the
  brief's worked example (group needs 3, only 2 unique products, no
  duplicates allowed → reject).
- `minSelections <= maxSelections` on every group, and `minItems <=
  maxItems` on the offer.
- no offer/group with zero products.
- no duplicate `OfferTier.quantity` values within one offer.
- combined pool size across an offer's products/groups stays within the cap
  in docs/BUNDLE_LIMITATIONS.md.
- **conflict check** (brief item 36): before activating, check whether any
  variant in this offer's scope is already claimed by a different *active*
  offer of a type that can't safely coexist on the same variant (two
  concurrent Quantity Breaks on the same variant, or a variant in two
  different Mix & Match pools with different discount rules, is ambiguous
  for the customer and for the Function's discount math). On conflict, the
  save is blocked with the exact merchant-facing message from the brief
  ("This variant is already used by another active BundlePilot offer."),
  offering `View offer` / `Deactivate offer` / `Continue only if safe`
  (allowed when the conflicting offers are compatible, e.g. two Mix & Match
  pools with identical discount terms).

## Status lifecycle

`DRAFT → (SCHEDULED | ACTIVE) → PAUSED ⇄ ACTIVE → EXPIRED → ARCHIVED`.
`DRAFT` offers are excluded from every storefront-facing and
Function-configuration query — they cannot affect the storefront by
construction (brief item 35), not just by convention: the metafield/discount
sync step (docs/DISCOUNT_ENGINE.md, docs/CART_TRANSFORM.md) only runs on
transition into `ACTIVE`/`SCHEDULED`, never on `DRAFT` saves.
