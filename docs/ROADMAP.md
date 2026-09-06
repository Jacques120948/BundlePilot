# Roadmap

Phased delivery plan (brief item 88). Each phase ends with: tests + lint +
typecheck + build green, the feature manually exercised, docs updated, and
a summary — never hand off a broken build to the next phase.

## Phase 0 — Foundation (this delivery)

- Shopify CLI React Router (TypeScript) app scaffold, embedded, App Bridge.
- PostgreSQL + Prisma schema for the full V1 data model (Offer and all
  child tables, Subscription/FeatureEntitlement, AnalyticsDaily, AuditLog).
- Mandatory + operational webhooks (`app/uninstalled`, `app/scopes_update`,
  `customers/data_request`, `customers/redact`, `shop/redact`), all
  HMAC-verified.
- Tenant isolation helper (`requireTenant`) and centralized entitlements
  (`entitlements.server.ts`) so no route ever queries without a `shopId` or
  branches on plan inline.
- Admin nav shell (Home / Offers / Create Bundle / Analytics / Settings /
  Plan) with placeholder pages wired to real loaders (zero-state, not
  dead links).
- Vitest unit tests, GitHub Actions CI (install/lint/typecheck/test/build
  against a real Postgres service).
- Architecture/compliance/scopes/bundle/security/database/billing docs
  (this directory).

**Not built yet**: any offer builder form, any Shopify Function, any theme
extension, any real billing integration, any analytics event ingestion.

## Phase 1 — Quantity Breaks

- Offer CRUD (create/edit/list/delete) for `QUANTITY_BREAK`.
- Resource Picker-based product/variant selection (manual + collection
  modes).
- Tier editor with admin validation (docs/BUNDLE_ARCHITECTURE.md).
- Discount Function extension (`cart.lines.discounts.generate.run`),
  scaffolded and deployed, implementing docs/DISCOUNT_ENGINE.md.
- Theme App Extension: Quantity Break block (radio tiers + Add to cart).
- Fixture tests for the Function (valid/invalid/expired/inactive cases).
- MVP acceptance test from brief item 89 passes end-to-end on a dev store.

## Phase 2 — Mix & Match core

- `MIX_MATCH` offer CRUD, pool selection, min/max/allowDuplicates.
- Cart Transform extension scaffolded, implementing
  docs/CART_TRANSFORM.md + docs/MIX_MATCH_ENGINE.md.
- Variant metafield sync on publish/edit.
- Cheat-test fixture (brief item 80) as an automated Function test.

## Phase 3 — Mix & Match storefront

- Bundle Builder theme block: progress indicator, live pricing, Add bundle
  to cart with `_bp_offer`/`_bp_session` attributes.
- Cart-removal / quantity-change behavior verified live (brief items 44-45,
  81).
- "Add BundlePilot to my theme" deep link (docs/SHOPIFY_COMPLIANCE.md).
- MVP acceptance test from brief item 90.

## Phase 4 — Grouped Mix & Match

- `BundleGroup` CRUD (add/reorder/required toggle) in the builder.
- Step-by-step storefront flow + summary screen.
- Acceptance test from brief item 91.

## Phase 5 — Design

- `OfferStyle` fields wired into both the admin live preview and the
  storefront block (single shared render engine, not two implementations).
- Template presets (Minimal/Cards/Compact/Premium).
- Responsive pass at 320/375/430/tablet/desktop; accessibility pass
  (keyboard, ARIA, contrast, no color-only signaling).

## Phase 6 — Analytics

- Event ingestion (`widget_view`, `bundle_started`, `product_selected`,
  `bundle_completed`, `tier_selected`, `add_to_cart`) into `AnalyticsDaily`.
- Dashboard: active bundles, views/starts/completions/addToCarts,
  completion rate, top bundle, most-selected products.

## Phase 7 — Billing

- Shopify App Pricing wired per docs/BILLING.md: subscription check,
  redirect-to-plan-page, entitlement enforcement blocking offer activation
  past plan limits (`assertCanActivateOffer`).

## Phase 8 — Hardening

- Multi-tenant isolation tests, webhook HMAC tests, large-catalog
  performance tests, Markets/multi-currency verification for any
  Fixed Amount discount edge cases, stock/race-condition UX
  (brief items 75-76).

## Phase 9 — App Store

- Full docs/SHOPIFY_COMPLIANCE.md re-verification against current
  shopify.dev requirements, privacy policy, listing content, Shopify's
  self-review tooling, submission.

## Explicitly deferred past V1 (brief item 93)

BOGO, Buy X Get Y, Free Gift, Frequently Bought Together, Cart/Post-purchase
Upsell, Subscription Bundles, Bundle Landing Pages, A/B testing, AI Bundle
Suggestions. The `OfferType` and enforcement-mechanism split
(docs/ARCHITECTURE.md "Extending OfferType") is designed so adding these
later doesn't require restructuring what Phases 0-9 build.
