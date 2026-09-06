# Bundle limitations (Shopify platform)

Verified against shopify.dev as of the 2026-07 API release (current stable
at time of writing; 2026-10 is release-candidate). Re-check this page before
relying on any of these numbers in a future phase — Shopify revises them.

## Cart Transform Function

- **One cart transform function per app per store.** If BundlePilot needs to
  merge lines for many different Mix & Match offers on the same shop, all of
  that logic must live in a single function/extension — see
  docs/CART_TRANSFORM.md for how we route to the right offer inside one
  function.
- **`linesMerge` and `lineExpand` work on every plan.** Only `lineUpdate`
  (overriding the price/title/image of an *existing* line without
  merge/expand) is restricted to development stores and Shopify Plus. This
  is why V1 uses `linesMerge` for Mix & Match instead of `lineUpdate`.
- **Nested bundles aren't supported.** A bundle can't have components and
  also be a component of another bundle.
- **A (Shopify-native) bundle can have up to 150 components and 3 options.**
  We adopt 150 as the default cap on products in a single Mix & Match pool /
  grouped bundle's combined groups (configurable, see
  docs/DATABASE.md), both to stay within Shopify's own bundle conventions
  and to keep our denormalized variant metafields (see
  docs/MIX_MATCH_ENGINE.md) under the metafield size limit below.
- Bundles (Shopify's native bundle feature) can't be combined with selling
  plans (subscriptions, pre-orders, try-before-you-buy). BundlePilot doesn't
  touch selling plans in V1, so this doesn't block us, but it means a
  Mix & Match offer should exclude variants that are subscription-only.

## Shopify Functions (general)

- **Input query budget: 30 points.** `metaobject(handle:)` costs 1,
  `field(key:)` on a metaobject costs 3, any `metafield` field costs 3.
  This is the reason our Mix & Match config is **denormalized onto each
  component variant's own metafield** rather than fetched from a single
  shop-level list of "all active offers" — the query cost scales with the
  number of lines actually in the cart, not with how many offers exist on
  the shop. See docs/MIX_MATCH_ENGINE.md.
- **Metafield values over 10,000 bytes are not returned to a function.**
  This bounds how large one offer's denormalized JSON (product/variant GIDs,
  group structure) can be — see docs/BUNDLE_PRODUCT_MODEL.md for the size
  budget math behind the 150-product cap.
- **Input query size: 3,000 bytes max**, list arguments/variables capped at
  100 elements.
- **No network access, no randomness, no clock.** Functions must be pure
  and deterministic; all configuration must arrive via the input query
  (metafields/metaobjects) — never fetched at runtime.
- **Binary/memory limits**: 256 kB compiled Wasm, 10,000 kB linear memory,
  512 kB stack. Not a practical constraint for our logic, but it's why we
  write functions in Rust rather than JS/TS where performance matters (the
  Cart Transform function, which runs for every checkout).
- Functions can only be referenced by mutations (`cartTransformCreate`,
  `discountAutomaticAppCreate`) from the **same app** that owns them.

## Discount Function

- One automatic app discount per Quantity Break offer (we create a
  `discountAutomaticApp` per offer, not one global discount for all
  offers) — this is what lets each offer have independent tiers, dates, and
  combination settings.
- `combinesWith` (product/order/shipping) is configurable per discount, but
  Shopify enforces its own combination rules across discount classes; we
  only expose the combinations Shopify itself allows (see
  docs/DISCOUNT_ENGINE.md).
- Only one *product* discount effectively applies per line by default;
  cross-app stacking on the same line is a Plus-only, opt-in feature
  (`productDiscountsWithTagsOnSameCartLine`) that V1 does not use.

## Theme App Extensions

- Up to 30 app blocks per theme app extension (raised from 25 in Feb 2026).
  BundlePilot ships 3 blocks (Quantity Break, Mix & Match, Grouped Mix &
  Match) well within this.
- App embed blocks are inactive until the merchant turns them on in the
  Theme Editor; an app cannot activate them programmatically. We instead
  deep-link merchants into the Theme Editor with the block pre-selected
  (see docs/THEME_EXTENSION.md, added in Phase 3).
- App **blocks** (as opposed to embed blocks) only render inside themes
  whose sections opt into `"blocks": [{"type": "@app"}]`. Most current
  Online Store 2.0 themes (Dawn and derivatives) support this; older
  vintage themes do not. We surface a clear "your theme doesn't support
  this" state rather than failing silently.

## Practical caps this drives in BundlePilot V1

| Limit | Value | Source |
|---|---|---|
| Max products in a Mix & Match pool / grouped bundle (combined) | 150 | Shopify bundle component cap + metafield size budget |
| Max groups per Grouped Mix & Match | 10 | Practical UX limit + input-query budget headroom, not a hard Shopify limit |
| Max active offers (Basic / Pro plans) | 10 / 30 | Business decision (docs/BILLING.md), not a platform limit |
| FIXED_BUNDLE_PRICE | Not in V1 | See docs/BUNDLE_ARCHITECTURE.md "Discount types" — deferred pending multi-currency/tax verification |

All of the above are enforced in admin validation (see
docs/BUNDLE_ARCHITECTURE.md "Admin validation") so a merchant can never save
an offer the Functions can't actually enforce.
