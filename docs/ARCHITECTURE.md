# Architecture

BundlePilot is a public, embedded Shopify app for Quantity Breaks and Mix &
Match bundles. This document is the top-level map; deeper decisions live in
the linked docs.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App template | Shopify CLI `reactRouter` template (TypeScript) | Shopify's currently recommended template; `@shopify/shopify-app-remix` is in maintenance mode in favor of `@shopify/shopify-app-react-router`. |
| Admin UI | Polaris web components (`<s-page>`, `<s-section>`, ...) via App Bridge | Shipped by the current template; matches Shopify admin look-and-feel out of the box (App Store design requirement). |
| Admin API access | GraphQL Admin API only | REST Admin API is legacy for new apps; no new code should use it. |
| Merchant-side data | PostgreSQL + Prisma | Relational integrity for Offer/BundleGroup/Tier trees; Prisma migrations give us a reviewable schema history. |
| Quantity Break enforcement | Discount Function (`cart.lines.discounts.generate.run`) | Server-side, deterministic, can't be bypassed by the storefront. |
| Mix & Match enforcement | Cart Transform Function (`cart_transform.run`, `linesMerge`) | Official mechanism for "Customized Bundles"; works on all plans (not Plus-gated), unlike `lineUpdate`. |
| Storefront UI | Theme App Extension (app blocks) | No theme code edits; merchant controls placement/enable via Theme Editor. |
| Billing | Shopify App Pricing | Shopify's current recommended billing path for new public apps — plans are configured in the Partner Dashboard/submission form, not hand-rolled Billing API code. |

See docs/SHOPIFY_COMPLIANCE.md for why each of these choices is also an App
Store compliance requirement, not just a technical preference.

## Request-time components

```
Merchant browser (embedded admin)
        │  App Bridge + session token
        ▼
React Router app (Node) ── Prisma ──▶ PostgreSQL (Offer, BundleGroup, ...)
        │  GraphQL Admin API
        ▼
Shopify (Discounts, Metafields, Cart Transforms, Webhooks)

Storefront (theme)
        │  Theme App Extension block (reads product/variant + Storefront API)
        ▼
Cart / Checkout
        │  Shopify Functions run server-side inside Shopify's checkout
        ▼
  - Discount Function  (Quantity Break)
  - Cart Transform Function (Mix & Match, Grouped Mix & Match)
```

The admin app and the two Shopify Functions are separate deployables with
separate lifecycles: the admin app writes configuration (as DB rows +
mirrored Shopify metafields/discounts), and the Functions read that
configuration back from Shopify's own object graph at checkout time. The
admin app is never in the request path for a checkout — this is what makes
the discount reliable even if our servers are down.

## Data flow: how an Offer becomes a real discount

1. Merchant configures an `Offer` (+ `OfferProduct`/`OfferVariant`/`OfferTier`/
   `BundleGroup`) in Postgres via the admin UI.
2. On publish, the app:
   - **Quantity Break**: creates/updates a `discountAutomaticApp` pointing at
     our Discount Function, with the tier config written to a metafield on
     the discount itself (`$app` namespace). See docs/DISCOUNT_ENGINE.md.
   - **Mix & Match / Grouped**: writes the offer's full configuration
     (allowed variants, groups, discount) as **variant metafields** on every
     component variant, and activates our single Cart Transform function if
     not already active. See docs/CART_TRANSFORM.md and
     docs/MIX_MATCH_ENGINE.md for why metafields live on the variant, not a
     shop-level object.
3. The Theme App Extension block reads the offer via the Storefront API
   (product/variant + our own metafields) to render tiers/pool/groups and
   compute a *preview* price. This preview is informational only.
4. At Add to Cart, the storefront adds the real Shopify variant(s) with
   quantities, tagging them with line item properties that name which
   offer/session they claim to belong to.
5. At cart/checkout evaluation, Shopify runs our Function(s). The Function
   re-derives the discount from the **variant metafields it queries itself**
   — never from the client-supplied properties or any discount amount sent
   by the browser. See docs/SECURITY.md "Cart security".

## Extending OfferType

`OfferType` (`app/lib/offer-types.ts`) is deliberately a closed, small enum
for V1: `QUANTITY_BREAK`, `MIX_MATCH`, `MIX_MATCH_GROUPED`. The `Offer` table
holds the fields common to all types; type-specific structure lives in
optional child tables (`OfferTier`, `BundleGroup`). Adding `FIXED_BUNDLE`,
`BOGO`, `FREE_GIFT`, or `FREQUENTLY_BOUGHT_TOGETHER` later means:

- add the value to `OFFER_TYPES`,
- add any new child table(s) it needs (following the `BundleGroup` pattern),
- add a branch in the offer-type picker UI and its own builder route,
- decide discount-function vs cart-transform-function enforcement and record
  it in `OFFER_TYPE_ENFORCEMENT`.

No existing table needs to change shape for this.

## Multi-tenancy

Every business-data table has a `shopId` foreign key to `Shop`. All server
code must resolve `Shop` via `app/lib/tenant.server.ts#requireTenant` and
filter every query by it — see docs/SECURITY.md "Multi-tenant isolation".

## Related docs

- docs/ROADMAP.md — phased delivery plan
- docs/SHOPIFY_COMPLIANCE.md — App Store requirements checklist
- docs/SHOPIFY_SCOPES.md — access scopes and why each is requested
- docs/BUNDLE_ARCHITECTURE.md — Offer/BundleGroup data model in depth
- docs/BUNDLE_LIMITATIONS.md — Shopify platform limits that shape the design
- docs/MIX_MATCH_ENGINE.md — how Mix & Match / Grouped validation works
- docs/DISCOUNT_ENGINE.md — Quantity Break Discount Function
- docs/CART_TRANSFORM.md — Mix & Match Cart Transform Function
- docs/BUNDLE_PRODUCT_MODEL.md — whether/how a bundle parent product is used
- docs/THEME_EXTENSION.md — storefront app blocks
- docs/SECURITY.md — tenant isolation, cart tampering, webhook verification
- docs/DATABASE.md — schema rationale
- docs/BILLING.md — Shopify App Pricing integration
