# Bundle product model

Answers: does BundlePilot need to create a "bundle parent product" in the
merchant's catalog?

## Decision (revised in Phase 2): one hidden parent variant per Mix & Match offer

Phase 0 originally concluded "no parent product at all" for Mix & Match,
reasoning that `linesMerge` produces a purely synthetic grouping. Building
the Cart Transform function in Phase 2 surfaced a correction: Shopify's
`linesMerge` operation **requires a `parentVariantId`** — every one of
Shopify's own reference implementations (the "Create a bundle app"
tutorial's `component_parents` pattern, and the current
metaobject-based "Merge bundle components" example in the Cart Transform
docs) merges into a real, dedicated `ProductVariant` per bundle, not a
shared placeholder or no variant at all. This doc is updated to match; the
"no parent product" framing below is kept only as a record of what changed
and why (see docs/ROADMAP.md for phase history).

So: **each `MIX_MATCH`/`MIX_MATCH_GROUPED` offer gets one hidden parent
product + its single default variant**, created lazily on the offer's
first publish:

- Created via `productCreate` with `title = offer.publicTitle` and no
  explicit variants (Shopify creates one default variant automatically);
  the app then sets that variant's price to a nominal, non-zero amount
  (Shopify's own bundle-parent guidance requires "price more than 0" —
  the value is never charged to a customer, since the Cart Transform
  operation's `price.percentageDecrease` always overrides the actual
  charged amount at cart/checkout time from the real component prices).
- **Never published** to any sales channel (Online Store, Shop, POS) —
  created products are unpublished by default unless explicitly published,
  so simply never calling `publishablePublish` keeps it out of the storefront,
  search, and sitemaps, satisfying brief item 20 ("don't clutter the
  merchant's catalog with visible products").
- Stored as `Offer.shopifyParentProductId` / `Offer.shopifyParentVariantId`
  and reused on every subsequent publish of that offer — never recreated.
- Why one per offer rather than one shared across all Mix & Match offers
  on a shop: Shopify's own examples model it per-bundle, and reusing a
  single generic parent across genuinely different bundles would collapse
  distinct bundle types into one line item identity in Shopify Admin
  Orders/Analytics/returns — the same generic "Bundle" product would appear
  regardless of which real bundle a customer bought.

Quantity Break needs no parent product: the existing product/variant *is*
the whole offer, and its enforcement (a Discount Function) never merges
lines in the first place.

## FIXED_BUNDLE_PRICE (still deferred)

If `FIXED_BUNDLE_PRICE` ships later (docs/BUNDLE_ARCHITECTURE.md "Discount
types") using Shopify's native Fixed Bundle mechanism (`requiresComponents`
+ `productVariantRelationshipBulkUpdate`) instead of a Cart
Transform-computed price, it would reuse the same per-offer parent variant
this doc already creates, just with `requiresComponents = true` and real
component relationships attached — not a second parent product. Still
gated on the multi-currency/tax verification in docs/BUNDLE_ARCHITECTURE.md.

## Metafield namespace ownership

All BundlePilot metafields use the literal namespace `"$app"` (see
`app/lib/shopify/metafields.ts#METAFIELD_NAMESPACE_APP`) — Shopify resolves
this server-side to a namespace unique to this app installation, so it's
usable verbatim in every shop without a per-app string to configure or any
collision risk with another app's data. Keys (not the namespace) are what
distinguish our different pieces of data — see
`app/lib/shopify/metafields.ts#METAFIELD_KEYS` for the single source of
truth.

| Owner | Key | Type | Storefront-readable? | Purpose |
|---|---|---|---|---|
| Discount (`discountAutomaticApp`) | `function-configuration` | json | No (Function-only) | Quantity Break tier config, read by the Discount Function's input query (docs/DISCOUNT_ENGINE.md) |
| Product | `quantity-break-display` | json | Yes — declared via TOML in `shopify.app.toml` with `access.storefront = "public_read"`, read in Liquid as `product.metafields.app.quantity-break-display` | Cached tiers/title for the Theme App Extension to render; never used for enforcement (docs/DISCOUNT_ENGINE.md "Storefront display metafield") |
| ProductVariant | `bundle-component` | json | No (Function-only) | Denormalized Mix & Match / Grouped offer config (docs/MIX_MATCH_ENGINE.md) — Phase 2 |

Only the `quantity-break-display` product metafield has a TOML-declared
definition (`[product.metafields.app.quantity-break-display]` in
`shopify.app.toml`) — that's what makes it visible/typed in the Shopify
admin and accessible from Liquid via the `product.metafields.app.*`
accessor. The Function-only metafields (`function-configuration`,
`bundle-component`) are written ad hoc via `metafieldsSet` with an inline
`type` on each write; they don't need an admin-visible definition since no
human ever reads or edits them directly, and Shopify Function input
queries can read any metafield by namespace+key regardless of whether a
definition exists.

No metafields are written on `Shop`, `Customer`, or `Order` in V1.
