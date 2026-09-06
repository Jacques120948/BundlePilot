# Cart Transform Function

Enforces `MIX_MATCH` and `MIX_MATCH_GROUPED` at checkout. One extension,
one function, target `cart.transform.run` (verified against the current
Cart Transform Function API reference — this is the current target name;
older examples from 2024 use the retired `purchase.cart-transform.run`
name, don't copy those). Written in JavaScript for Phase 2; Rust is
Shopify's recommended language for performance-sensitive functions and is
worth revisiting once this is verified against a real store (see
"Verification status").

## Why Cart Transform and not the Discount Function for Mix & Match

The Discount Function API can reduce a line's price, but it can't **regroup
separate line items into one bundle line** or attach a synthetic
title/image the way `linesMerge` can. Since a Mix & Match bundle is
visually and structurally a single purchase (one line in cart/checkout/
orders, per brief items 42-43), Cart Transform is the correct mechanism —
this matches Shopify's own "Customized Bundles" architecture.

## The parent variant requirement

`linesMerge` requires a `parentVariantId` — a real `ProductVariant` that
represents the merged line's identity in Admin/Orders/reporting. BundlePilot
creates one hidden, unpublished variant per Mix & Match offer for this
purpose; see docs/BUNDLE_PRODUCT_MODEL.md for the full reasoning (this is a
correction from Phase 0's original "no parent product" design).

## Input query

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      cost {
        amountPerQuantity { amount }
      }
      merchandise {
        __typename
        ... on ProductVariant {
          id
          bundleComponent: metafield(namespace: "$app", key: "bundle-component") {
            jsonValue
          }
        }
      }
      offerAttr: attribute(key: "_bp_offer") { value }
      sessionAttr: attribute(key: "_bp_session") { value }
    }
  }
}
```

See `extensions/mix-match-cart-transform/src/cart_transform_run.graphql`
for the exact query. It must stay within the 30-point input query budget
(docs/BUNDLE_LIMITATIONS.md) — this query costs well under that regardless
of cart size, since cost scales with cart lines, not with metafield fields
requested per line (3 points for the one `metafield` field, flat).

## Algorithm (`cartTransformRun`, per docs/MIX_MATCH_ENGINE.md step list)

1. Group cart lines by the `(_bp_offer, _bp_session)` attribute pair.
2. For each group, keep only lines whose own `bundle-component` metafield
   references that exact `offerId` (and matching `offerVersion`) — this is
   the tamper check. A line with no metafield, a mismatched `offerId`, or a
   stale `offerVersion` is dropped from the group.
3. Validate the surviving lines against the config carried in those same
   metafields: sum their quantities into a total item count and check it
   against `minItems`/`maxItems` and each group's `min`/`max`/`required`;
   if `allowDuplicates` is false, reject the group if any variant
   contributes more than one unit in total (a `quantity > 1` line, or the
   same variant present on more than one line).

   **Deliberate V1 simplification**: each `(offer, session)` group forms at
   most **one** merged bundle, using every surviving line's own quantity
   as-is. Stacking multiple complete bundles from one cart (e.g., doubling
   every component's quantity to buy two bundles at once and still get one
   merged discounted line) isn't supported yet — the customer would need to
   run the storefront builder twice. This keeps the validation logic simple
   and correct for the brief's actual acceptance tests; revisit if merchants
   ask for cart-level bundle multiples.
4. If valid, emit:

   ```json
   {
     "linesMerge": {
       "cartLines": [{ "cartLineId": "...", "quantity": "<that line's own quantity>" }, ...],
       "parentVariantId": "<offer's Offer.shopifyParentVariantId>",
       "title": "<offer.publicTitle>",
       "price": { "percentageDecrease": { "value": <effectivePercentage> } }
     }
   }
   ```

   `percentageDecrease` is the only price-adjustment field verified against
   current docs. `PERCENTAGE` discounts map directly to it. `FIXED_AMOUNT`
   discounts are converted to an equivalent percentage at run time
   (`fixedAmount / componentsSum * 100`, computed from the `cost` the input
   query already fetches) — this produces the identical dollar discount
   without depending on an unconfirmed fixed-amount operation field. See
   "Verification status" for double-checking this against `shopify app
   function typegen` output.
5. If invalid: emit no operation for that group (lines stay separate, full
   price).
6. Lines with no `_bp_offer` attribute are left untouched entirely — this
   function only ever acts on lines that opted into a BundlePilot bundle.

## Recomputation on every mutation

Shopify re-runs `cart.transform.run` whenever the cart changes (add,
remove, quantity update). The function has no persistent state between
runs — every run recomputes validity from scratch off the current cart
lines and their variant metafields. This is what makes "remove a component
→ discount disappears" and "change quantity → tiers re-evaluate" work
without any explicit invalidation code (see docs/MIX_MATCH_ENGINE.md
"Removing a component").

## One function, many offers

Because at most one Cart Transform function can be active per app per
store, this single function must handle every Mix & Match /
Grouped Mix & Match offer on the shop simultaneously. It does this
correctly because step 1-3 above operate per `(offer, session)` group
independently — the function never needs to know how many offers exist in
total, only which offer each present line claims (see
docs/MIX_MATCH_ENGINE.md "Why not a shop-level lookup").

## Activation lifecycle

- On the shop's **first** Mix & Match (of either type) publish, the app
  calls `cartTransformCreate(functionId: ...)` once and stores the result
  as `Shop.cartTransformId`.
- Every publish (first or subsequent) creates/reuses that offer's parent
  variant (docs/BUNDLE_PRODUCT_MODEL.md) and writes/clears `bundle-component`
  variant metafields for the offer's current pool — see
  `app/lib/shopify/mix-match-sync.server.ts`.
- On uninstall, Shopify automatically deactivates the app's functions; no
  explicit `cartTransformDelete` is required. The parent variant products
  and component metafields are Shopify-owned data outside our database and
  are cleaned up per Shopify's standard app-uninstall behavior, not by
  BundlePilot itself.

## What this function must never do

- Never read a discount amount, price, or "is valid" flag from cart
  attributes/line item properties — only IDs used to look up the
  server-trusted metafield.
- Never make a network call (not possible for functions anyway, but worth
  stating: all configuration must already be on the metafields it queries).
- Never emit `lineUpdate` — see docs/BUNDLE_LIMITATIONS.md on why that
  operation is Plus/dev-store only and `linesMerge` is used instead.

## Verification status

The target name, `linesMerge` operation shape, and `parentVariantId`
requirement were verified against the current Cart Transform Function API
reference and Shopify's own reference implementations. The `FIXED_AMOUNT`→
percentage conversion is a deliberate implementation choice, not a verified
Shopify field, and the exact input query field costs should be re-checked
with `shopify app function typegen` once this app is linked to a Partner
org — no live store was available to exercise this end to end in this
environment (see docs/DISCOUNT_ENGINE.md "Verification status" for the same
caveat on Phase 1).
