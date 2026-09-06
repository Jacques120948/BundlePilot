# Cart Transform Function

Enforces `MIX_MATCH` and `MIX_MATCH_GROUPED` at checkout. One extension,
one function, targeting `cart_transform.run` (Rust — Shopify's recommended
language for functions on the checkout hot path; see
docs/BUNDLE_LIMITATIONS.md on performance limits).

## Why Cart Transform and not the Discount Function for Mix & Match

The Discount Function API can reduce a line's price, but it can't **regroup
separate line items into one bundle line** or attach a synthetic
title/image the way `linesMerge` can. Since a Mix & Match bundle is
visually and structurally a single purchase (one line in cart/checkout/
orders, per brief items 42-43), Cart Transform is the correct mechanism —
this matches Shopify's own "Customized Bundles" architecture
(shopify.dev "About product bundles" / "Add a customized bundle function").

## Input query

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      cost { amountPerQuantity { amount } }
      merchandise {
        __typename
        ... on ProductVariant {
          id
          bundleComponent: metafield(namespace: "$app", key: "bundle_component") {
            jsonValue
          }
        }
      }
      attribute(key: "_bp_offer") { value }
      sessionAttr: attribute(key: "_bp_session") { value }
    }
  }
}
```

(Field names abbreviated here; see `extensions/mix-match-cart-transform/src/run.graphql`
once scaffolded in Phase 2 for the exact query, which must stay within the
30-point budget — see docs/BUNDLE_LIMITATIONS.md.)

## Algorithm (`run` function, per docs/MIX_MATCH_ENGINE.md step list)

1. Group cart lines by the `(_bp_offer, _bp_session)` pair read from their
   attributes.
2. For each group, keep only lines whose own `bundleComponent` metafield
   references that exact `offerId` — this is the tamper check.
3. Validate the surviving lines against the config carried in those same
   metafields (`minItems`/`maxItems`/`allowDuplicates`/`groups[].min/max`).
4. If valid: emit one `linesMerge` operation combining the surviving line
   IDs into a single parent line, with `price` set to the sum of components
   minus the configured discount (allocated per Shopify's standard bundle
   discount behavior — see docs/MIX_MATCH_ENGINE.md "Discount types") and
   `title` set to the offer's `publicTitle`.
5. If invalid: emit no operation for that group (lines stay separate,
   full price).
6. Lines with no `_bp_offer` attribute, or whose offer isn't currently
   active, are left untouched — this function only ever acts on lines that
   opted into a BundlePilot bundle.

## Recomputation on every mutation

Shopify re-runs `cart_transform.run` whenever the cart changes (add,
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
  calls `cartTransformCreate(functionHandle: ...)` once.
- On every subsequent Mix & Match publish/edit, the app only writes/updates
  variant metafields — the Cart Transform registration itself doesn't
  change.
- On uninstall, Shopify automatically deactivates the app's functions; no
  explicit `cartTransformDelete` is required (and the metafields are
  cleaned up per docs/SHOPIFY_COMPLIANCE.md's `shop/redact` handling — see
  app/routes/webhooks.shop.redact.tsx, though the *metafield values on the
  merchant's own products* are Shopify-owned data outside our database and
  are handled by Shopify's standard app-uninstall metafield cleanup, not by
  BundlePilot itself).

## What this function must never do

- Never read a discount amount, price, or "is valid" flag from cart
  attributes/line item properties — only IDs used to look up the
  server-trusted metafield.
- Never make a network call (not possible for functions anyway, but worth
  stating: all configuration must already be on the metafields it queries).
- Never emit `lineUpdate` — see docs/BUNDLE_LIMITATIONS.md on why that
  operation is Plus/dev-store only and `linesMerge` is used instead.
