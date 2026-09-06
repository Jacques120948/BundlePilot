# Theme App Extension

One theme app extension (`extensions/bundlepilot-theme`), one app block per
offer type. Phase 1 ships the Quantity Break block; Mix & Match and Grouped
Mix & Match blocks follow in Phases 3-4 as separate blocks in the same
extension (the 30-block-per-extension cap in docs/BUNDLE_LIMITATIONS.md
gives plenty of headroom).

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

## Adding the block to a theme

Merchants add it manually via Theme Editor → Add block → Apps →
BundlePilot: Quantity Break, on any product template. A one-click deep
link ("Add BundlePilot to my theme" from Settings, per brief item 46) is
planned but not implemented in Phase 1 — `app/routes/app.settings.tsx`
currently links to the generic theme editor apps panel
(`shopify://admin/themes/current/editor?context=apps`) as an interim step.

## Verification status

Not exercised in a live theme in this environment (no Partner org/dev
store linked here — see docs/DISCOUNT_ENGINE.md "Verification status").
Verify the block renders, the price preview matches the Function's actual
checkout discount, and Add to cart works, on a real dev store before
relying on this.
