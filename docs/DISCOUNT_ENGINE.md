# Discount engine (Quantity Break)

Enforces `QUANTITY_BREAK`. Uses the current unified Discount Function API
target `cart.lines.discounts.generate.run` (the successor to the deprecated
separate cart-lines/product-discount targets) with discount class
`PRODUCT`.

## Why a Discount Function (not Cart Transform) for Quantity Break

A Quantity Break doesn't need to regroup or rename line items — the
customer already has one line item (the product) at some quantity; the only
thing that needs to change is its price. That's exactly what
`productDiscountsAdd` on the Discount API does, and it's the
Shopify-recommended mechanism for "volume discounts with different rates
when a line item quantity meets defined thresholds" (shopify.dev "Build
with Shopify Functions").

## One discount per offer

Each `QUANTITY_BREAK` `Offer` gets its own `discountAutomaticApp` (not one
shared discount for all offers), created via
`discountAutomaticAppCreate(functionId: ...)` on publish. This gives each
offer independent:

- `combinesWith` settings (docs/BUNDLE_ARCHITECTURE.md "Combination rules"),
- start/end dates,
- activation state (pausing an offer = deactivating its discount, not
  touching the function).

The offer's tier configuration is written to a metafield on the discount
node itself (namespace `$app`, key `function-configuration`), read by the
function's input query — this is the metafield-for-input-queries pattern
Shopify documents, scoped per-discount so it naturally supports many
independent Quantity Break offers without the "how many active offers"
budget problem that Mix & Match has (see docs/MIX_MATCH_ENGINE.md): each
discount's function invocation only ever sees *its own* metafield.

## Tier selection logic

```
metafield.tiers = [
  { quantity: 1, discountType: "PERCENTAGE", discountValue: 0 },
  { quantity: 2, discountType: "PERCENTAGE", discountValue: 10 },
  { quantity: 3, discountType: "PERCENTAGE", discountValue: 15 },
  { quantity: 4, discountType: "PERCENTAGE", discountValue: 20 },
]
```

For each cart line whose variant is in the offer's product/variant scope,
the function finds the **highest** `quantity` tier that the line's quantity
meets or exceeds, and applies only that tier's discount as a single
`productDiscountsAdd` candidate targeting that cart line. Tiers never
stack: quantity 5 against the tiers above applies 20%, not 0+10+15+20%.
This matches brief item 24's requirement and the acceptance test in item
77 (100 CHF × qty → 100/180/255/320/400).

## Scope: which products/variants a Quantity Break applies to

The function input query includes each cart line's product/variant ID and
compares it against the offer's configured scope (`OfferProduct`/
`OfferVariant`, mirrored into the discount's metafield as a list of variant
GIDs, or `"ALL_VARIANTS"` for "apply to all variants of this product").
Lines outside the scope are left untouched.

## Combination rules

The offer's `combinesWithProductDiscounts` / `combinesWithOrderDiscounts` /
`combinesWithShippingDiscounts` fields map directly to
`DiscountCombinesWith` on `discountAutomaticAppCreate`. We only expose
combinations Shopify itself permits at the given plan tier (e.g.
`productDiscountsWithTagsOnSameCartLine` is Plus-only and out of scope for
V1) — the admin UI never offers a toggle that would fail at save time.

## What this function must never do

- Never trust a discount percentage from anywhere but its own metafield.
- Never look at customer data (no discount in V1 is customer-targeted).
- Never apply more than one tier per line.
