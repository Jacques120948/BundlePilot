# Theme App Extension

One theme app extension (`extensions/bundlepilot-theme`), one app block per
offer type. Phase 1 shipped the Quantity Break block; Phase 3 added the
Mix & Match block; Phase 4 makes that same block also render Grouped Mix &
Match (the 30-block-per-extension cap in docs/BUNDLE_LIMITATIONS.md gives
plenty of headroom, but a single block that dispatches on the bundle's
shape needed no second one).

## Quantity Break block

- `blocks/quantity-break.liquid` — targets `"section"` (an app block, not
  an app embed), `enabled_on.templates = ["product"]`. Renders only when
  the product has a `quantity-break-display` metafield (i.e., an active
  Quantity Break offer covers it) and a sellable variant is selected.
- `assets/quantity-break.js` — vanilla JS, no framework: parses the
  metafield JSON, renders tier radio options with a live price/savings
  preview, and posts to Shopify's own `/cart/add.js` on "Add to cart".
- `assets/quantity-break.css` — scoped under `.bundlepilot-qb`, mobile-first
  (44px touch targets, no horizontal overflow at 320px).

## Data flow

```
product.metafields.app.quantity-break-display  (written by the app on publish)
        │  Liquid, at render time
        ▼
data-config="{...}" on the block's root element
        │  parsed by quantity-break.js
        ▼
Tier list rendered with a *preview* price
        │  customer picks a tier, clicks Add to cart
        ▼
POST /cart/add.js { items: [{ id: variantId, quantity }] }   ← no discount data sent
        │
        ▼
Shopify cart — Discount Function computes the real price (docs/DISCOUNT_ENGINE.md)
```

The widget never sends anything discount-related to the cart — only a
variant id and quantity, exactly like a plain "Add to cart" button would.
This is what makes the preview price purely cosmetic: even if the JS were
tampered with in the browser, there is nothing it could send that would
change what the Function applies at checkout (docs/SECURITY.md "Cart
security").

## Accessibility (brief item 51)

- Tier options are real `<input type="radio">` elements inside a
  `<fieldset>`/`<legend>`, so screen readers and keyboard navigation work
  without any custom ARIA wiring.
- Savings/badges are additional text alongside the price, never conveyed by
  color alone.
- Buttons and radio targets are sized for touch (44px minimum).
- Full screen-reader and contrast pass is tracked in Phase 5 alongside the
  visual template system.

## Stock / errors (brief items 75-76)

`/cart/add.js` is Shopify's own endpoint — it already rejects an
unsellable variant. `quantity-break.js` surfaces that as
"We couldn't add this to your cart. Please try again." (never a stack
trace or internal error) and re-enables the Add to cart button so the
customer isn't stuck.

## Mix & Match block (Phase 3)

- `blocks/mix-match.liquid` — targets `"section"` too, but with no
  `enabled_on.templates` restriction: a Mix & Match bundle spans many
  products, so it has no single product page of its own. Merchants add it
  to any page (typically a dedicated "Build a bundle" page). Settings:
  `bundle_id` (text, optional — disambiguates when a shop has more than
  one active bundle), `show_savings` (checkbox), `accent_color` (color).
- `assets/mix-match.js` — vanilla JS: reads the **shop-level**
  `shop.metafields.app['mix-match-bundles']` metafield (a map of every
  active Mix & Match offer, keyed by offer id — see
  docs/MIX_MATCH_ENGINE.md "Storefront display metafield"), picks the
  bundle to render (`bundle_id` setting, or the sole active bundle if only
  one exists), and renders a product grid with steppers (when
  `allowDuplicates`) or checkboxes (when not), a live progress indicator
  ("2 / 3 selected"), a "Bundle complete ✓" badge once `minItems` is met,
  and a live regular/savings/bundle price summary recomputed from the
  same tier logic as the Function (docs/MIX_MATCH_ENGINE.md "Tiers").
- `assets/mix-match.css` — scoped under `.bundlepilot-mm`, same
  mobile-first / 44px-touch-target approach as the Quantity Break block,
  with a tighter grid breakpoint at 375px.

### Add to cart / session grouping

"Add bundle to cart" posts every selected variant in a single
`/cart/add.js` call, each line tagged with two properties:

```
_bp_offer   = <offer id>            // which bundle this line belongs to
_bp_session = <crypto.randomUUID()> // groups lines from the same click
```

A fresh `_bp_session` is generated per "Add to cart" click (not per page
load), so adding the same bundle twice in a row creates two independent,
separately-validated groups rather than merging into one. As with Quantity
Break, nothing about the discount amount is sent — only variant ids,
quantities, and these two routing properties; see
docs/MIX_MATCH_ENGINE.md "Why the client-declared offer/session id is safe
to use as a lookup key" for how the Cart Transform function treats them as
untrusted.

### Cart-removal / quantity-change behavior (brief items 44-45, 81)

The block itself has no cart-editing UI (removal happens on Shopify's own
cart/checkout pages). Because the Cart Transform function recomputes the
bundle from scratch on every cart mutation (docs/CART_TRANSFORM.md
"Recomputation on every mutation"), removing a component or dropping a
line's quantity below what was added simply means that `(offer, session)`
group no longer satisfies `minItems`/group `min` on the next run — the
discount stops being emitted automatically, with no separate
"uninstall the bundle" code path. This is exercised by the Cart Transform
Function's own unit tests (brief item 81 scenario, see
`extensions/mix-match-cart-transform/src/cart_transform_run.test.ts`); it
still needs to be watched once in a real cart during live verification.

## Grouped Mix & Match step-by-step flow (Phase 4)

The same `blocks/mix-match.liquid` block and `assets/mix-match.js` script
render a Grouped Mix & Match bundle too — no second block was needed.
`mix-match.js` decides which renderer to use by checking whether the
picked bundle's display-config entry carries a non-empty `groups` array
(see docs/MIX_MATCH_ENGINE.md "Storefront display metafield" — grouped
entries populate `groups` instead of the flat `products` list):

- **One step per group.** Each step shows that group's own product grid
  (steppers or checkboxes, per that group's own `allowDuplicates` — see
  docs/MIX_MATCH_ENGINE.md "Grouped bundles"), the group's name/description,
  its own "Choose N" or "Choose N–M" range, and Back/Next buttons. "Next"
  (labelled "Review bundle" on the last group) is disabled until the
  current group's own range is satisfied — an optional group can be left
  empty and skipped.
- **Selections persist across steps** in one shared `Map` for the whole
  bundle, so navigating back to an earlier step never loses what was
  already picked in a later one.
- **Summary screen** (after the last group): lists every group's picks by
  name, then the same regular/savings/bundle price breakdown as the flat
  block (tier-aware, via the shared `computeSummary`), a "Bundle complete
  ✓" badge once every group's own range is satisfied, and the "Add bundle
  to cart" button — disabled until complete, and posting every selected
  variant across every group in one `/cart/add.js` call tagged with the
  same `_bp_offer`/`_bp_session` properties described above. A customer
  can still go Back from the summary screen to change a selection before
  adding to cart.

Nothing about pricing is computed differently for the storefront preview
between flat and grouped — both call the same `computeSummary`, which
picks the discount/tiers off the bundle-wide config either way (a group
never carries its own discount, only its own selection rules).

## Adding the blocks to a theme

Merchants can add either block manually via Theme Editor → Add block →
Apps → BundlePilot: Qty Break / BundlePilot: Mix & Match (theme app block
names have a 25-character limit, hence "Qty" rather than "Quantity"). As
of Phase 3, `app/routes/app.settings.tsx` also renders two one-click
"Add … to my theme" deep links (brief item 46) built from
`SHOPIFY_API_KEY` at request time — no hardcoded client id — using the
format documented at
shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-block-deep-linking:

- Quantity Break → `?template=product&addAppBlockId={api_key}/quantity-break&target=mainSection`
- Mix & Match → `?template=page&addAppBlockId={api_key}/mix-match&target=newAppsSection`

If the app isn't yet linked to a Partner app (`SHOPIFY_API_KEY` unset),
the Settings page shows a warning instead of broken links, pointing the
merchant/developer at `shopify app config link`.

## Verification status

Not exercised in a live theme in this environment (no Partner org/dev
store linked here — see docs/DISCOUNT_ENGINE.md "Verification status").
Verify both blocks render, the price preview matches the Function's actual
checkout discount, Add to cart works, the deep links land on the right
block in the Theme Editor, cart-removal behavior (Mix & Match, flat and
grouped), and the grouped step-by-step flow end to end (advancing through
every group, going Back without losing selections, reaching and adding
from the summary screen) on a real dev store before relying on this.
