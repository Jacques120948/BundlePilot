# Mix & Match engine

Covers both `MIX_MATCH` (flat pool) and `MIX_MATCH_GROUPED` (stepped
groups). Both are enforced by the same Cart Transform function; grouped is a
superset (a flat pool is a single unnamed group with `minSelections =
maxSelections = offer.minItems`).

## Why not a shop-level "all active offers" lookup?

The obvious design — the Cart Transform function's input query fetches a
list of all active Mix & Match offers for the shop (e.g. via app-owned
metaobjects) and matches cart lines against them — runs into the **30-point
input query budget** (docs/BUNDLE_LIMITATIONS.md). Each metaobject fetched
costs 1 + 3 per field; with several active offers this blows the budget
before the function has queried anything about the cart itself. Worse, the
query is static (defined at deploy time), so it can't be parametrized per
request to "only fetch the offer(s) referenced by this cart" — Shopify
Functions don't support that.

## The design we use instead: denormalize onto component variants

Every product variant that is a component of *any* active Mix & Match or
Grouped Mix & Match offer gets one metafield:

```
namespace: "$app" (BundlePilot's reserved namespace, see docs/BUNDLE_PRODUCT_MODEL.md)
key:       "bundle-component"
type:      json
value: {
  "offerId": "off_abc123",
  "offerVersion": 3,
  "discountType": "PERCENTAGE",
  "discountValue": 15,
  "minItems": 3,
  "maxItems": 3,
  "allowDuplicates": false,
  "groups": [
    { "id": "grp_1", "min": 1, "max": 1, "required": true,
      "variantIds": ["gid://shopify/ProductVariant/1", "..."] },
    { "id": "grp_2", "min": 1, "max": 1, "required": true,
      "variantIds": ["gid://shopify/ProductVariant/9", "..."] }
  ]
}
```

For a flat `MIX_MATCH` offer, `groups` has a single entry covering the
whole pool. Every variant that belongs to the offer carries the **same**
snapshot (denormalized), so the query cost of validating a bundle scales
with **cart size**, not with how many offers exist on the shop: the
function only ever fetches the `bundle-component` metafield for variants
that are actually in the cart.

This mirrors Shopify's own "Create a bundle app" tutorial pattern
(`component_reference`/`component_quantities`/`component_parents` on
variant metafields), generalized to support groups and tiers.

`offerVersion` lets the function detect a stale write mid-request (rare,
but cheap to guard): if two lines claim the same `offerId` but disagree on
`offerVersion`, the cart is treated as not-yet-consistent and the discount
is withheld until the merchant's edit has fully propagated to every
component variant (propagation is a same-request bulk `metafieldsSet`, so
this is a defensive check, not an expected steady state).

## Why the client-declared offer/session id is safe to use as a lookup key

The storefront tags each cart line it adds with line item properties:

```
_bp_offer   = "off_abc123"      // which offer this line claims to belong to
_bp_session = "sess_9f2..."     // groups the lines added together in one "Add bundle to cart" click
```

These are **untrusted input** — a customer can edit them via any cart
mutation. The function only ever uses `_bp_offer` to know *which variant
metafield's groups to validate against*; it never uses it, or anything else
client-supplied, to decide *whether* a discount applies. Concretely, for
each distinct `_bp_offer` + `_bp_session` combination present in the cart:

1. Collect every cart line claiming that `(offer, session)` pair.
2. For each such line, read that line's own variant's `bundle-component`
   metafield (server-side truth). If a line claims an offer its variant's
   own metafield doesn't reference (or the variant has no such metafield at
   all), that line is dropped from the candidate set — a tampered property
   can only ever *remove* a line from consideration, never add unearned
   value.
3. Using the (now-verified) offer config carried on the metafields
   themselves, check the remaining lines against `minItems`/`maxItems`,
   `allowDuplicates`, and every group's `min`/`max`/`required`.
4. Only if the check passes does the function emit a `linesMerge` operation
   with the discount computed from the config's `discountType`/
   `discountValue` — never from anything the browser sent.
5. If the check fails (missing group, too few items, disallowed duplicate),
   the function emits no operation for those lines: they stay in the cart
   as regular full-price line items. Nothing about this can raise the
   discount above what the merchant configured; it can only fail closed to
   "no discount."

This is the concrete mechanism behind the brief's "never trust the
browser" requirement (see docs/SECURITY.md "Cart security") — the
line-item properties are a *routing hint*, not a *trust boundary*.

## Tiers (volume discounts on top of Mix & Match)

When an offer defines tiers ("choose 2 → 10%, choose 3 → 15%, choose 4 →
20%") instead of one flat discount, `bundle-component.tiers` replaces
`discountType`/`discountValue` with a list, and the function selects the
highest tier whose `quantity` the verified item count meets — mirroring the
Quantity Break tier-selection logic in docs/DISCOUNT_ENGINE.md. Tiers never
stack.

## Removing a component in the cart / changing quantity

Because the discount is recomputed from scratch on every cart mutation
(Shopify re-runs the Cart Transform function on every cart change), there is
no separate "invalidate" code path: removing a component simply means that
`_bp_offer`/`_bp_session` group now has fewer verified lines, so step 3
above naturally fails the `minItems` check on the next run and the
`linesMerge`/discount stops being emitted. See docs/CART_TRANSFORM.md
"Recomputation on every mutation" for the mechanics.

## Storefront display metafield (Phase 3)

The `bundle-component` metafield above exists purely for the Cart
Transform Function to verify a discount — it is never read by the
storefront (`access.storefront` is not even granted on it). Mix & Match
needs a *separate*, deliberately display-only channel for the storefront
block to render a bundle picker, because unlike Quantity Break (one
product → one metafield → one block instance) a Mix & Match bundle spans
many products with no single product page to attach a metafield to.

That channel is a **shop-level** metafield,
`shop.metafields.app['mix-match-bundles']` (namespace `$app`, key
`mix-match-bundles`, `access.storefront = public_read`), holding a map of
*every currently active* Mix & Match offer for the shop, keyed by offer
id:

```json
{
  "off_abc123": {
    "offerId": "off_abc123",
    "publicTitle": "Build your gift box",
    "description": "...",
    "minItems": 3,
    "maxItems": 3,
    "allowDuplicates": false,
    "discountType": "PERCENTAGE",
    "discountValue": 15,
    "tiers": [...],
    "products": [
      { "variantId": "gid://shopify/ProductVariant/1", "title": "...", "imageUrl": "...", "price": "12.00" }
    ]
  }
}
```

`app/lib/shopify/mix-match-display-config.ts` builds this map (pure
function, unit tested); `app/lib/shopify/mix-match-display-sync.server.ts`
does a **full rewrite** of the metafield on every publish, pause, and
delete of a Mix & Match offer (`app/lib/mix-match-publish.server.ts` and
the delete branch of `app/routes/app.offers.$id.tsx`) — never an
incremental patch, so a stale entry can't survive an offer going away.

Because this metafield only ever describes offers, never a cart or a
specific customer's state, tampering with it client-side is meaningless:
the worst a customer could do is make the *preview* look wrong, since
`mix-match.js` never sends any of these fields to the cart — only variant
ids/quantities and the `_bp_offer`/`_bp_session` routing pair the Cart
Transform Function independently re-verifies (see "Why the
client-declared offer/session id is safe to use as a lookup key" above).

When a shop has more than one active Mix & Match bundle, the theme
block's `bundle_id` setting (a value the merchant copies from the Offer
detail page in the admin) tells `mix-match.js` which map entry to render;
with exactly one active bundle it falls back to that one automatically —
see docs/THEME_EXTENSION.md "Mix & Match block".

## Discount types

- `PERCENTAGE` and `FIXED_AMOUNT`: implemented in V1. Allocated across the
  merged bundle's components proportionally to their price (Shopify's
  standard bundle discount allocation), so line-level totals still make
  sense in Admin/Orders/returns.
- `FIXED_BUNDLE_PRICE`: **deferred**, see docs/BUNDLE_ARCHITECTURE.md
  "Discount types" for the multi-currency/tax verification this needs
  before it can ship safely.
