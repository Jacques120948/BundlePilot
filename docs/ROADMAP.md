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

## Phase 1 — Quantity Breaks (built; live verification pending)

Delivered:

- Offer CRUD (create/edit/pause/delete; product-level scope via the
  Resource Picker, manual selection only) — `app/lib/offers.server.ts`,
  `app/routes/app.offers.*.tsx`, `app/components/QuantityBreakBuilder.tsx`.
- Tier editor with server-side admin validation
  (`app/lib/validation/quantity-break.ts`, docs/BUNDLE_ARCHITECTURE.md).
- Discount Function extension (`extensions/quantity-break-discount`,
  `cart.lines.discounts.generate.run`), implementing
  docs/DISCOUNT_ENGINE.md, with unit tests reproducing the brief item 77
  acceptance numbers exactly (100/180/255/320/400 CHF) and the item 80
  cheat-test invariant.
- Theme App Extension Quantity Break block
  (`extensions/bundlepilot-theme`) — see docs/THEME_EXTENSION.md.
- Shopify sync layer (`app/lib/shopify/quantity-break-sync.server.ts`):
  discount create/update/pause/resume + both metafield writes.

Deferred to a fast-follow within Phase 1 scope (not blocking Phase 2):

- Collection-based selection mode and variant-level scoping (the schema
  and `SelectionMode`/`OfferVariant` already support both; only the
  builder UI doesn't expose them yet).
- Conflict-check UI (`View offer` / `Deactivate offer` / `Continue only if
  safe` per brief item 36) — the backend check
  (`findConflictingActiveOffers`) exists and blocks activation; the admin
  currently only surfaces the error message, not the three actions.

**Not independently verified end-to-end** (no Shopify Partner org linked
in the environment this was built in — see docs/DISCOUNT_ENGINE.md
"Verification status" and docs/THEME_EXTENSION.md "Verification status"):
link the app, `shopify app deploy`, run `shopify app function typegen`,
and walk the brief item 89 acceptance test on a real dev store before
treating this phase as done.

## Phase 2 — Mix & Match core (built; live verification pending)

Delivered:

- Flat `MIX_MATCH` offer CRUD (create/edit/pause/delete), variant-pool
  selection via the Resource Picker (`type: "variant"`, so a merchant
  picks specific SKUs across any collection, not whole products),
  min/max/allowDuplicates, and a flat discount **or** volume tiers (not
  both) — `app/lib/offers.server.ts`, `app/lib/validation/mix-match.ts`,
  `app/components/MixMatchBuilder.tsx`.
- Cart Transform extension (`extensions/mix-match-cart-transform`,
  target `cart.transform.run`) implementing docs/CART_TRANSFORM.md +
  docs/MIX_MATCH_ENGINE.md, with unit tests covering the brief's item 78
  (pool/duplicates/min/max), item 79 (generalized to real multi-group
  validation, proving the same function needs no changes for Phase 4),
  item 80 (cheat test), and item 81 (removing a component invalidates the
  bundle) acceptance scenarios — 15 tests, all passing.
- Shopify sync layer (`app/lib/shopify/mix-match-sync.server.ts`,
  `app/lib/mix-match-publish.server.ts`): creates the shop-wide Cart
  Transform registration once, creates/reuses a hidden per-offer parent
  variant, and writes/clears the denormalized `bundle-component` variant
  metafields on publish/edit — each Shopify object is persisted to the
  database the moment it's created so a mid-publish failure never
  duplicates a parent product or cart transform on retry.

**Correction from Phase 0/1 research**: building the actual Cart Transform
function surfaced that `linesMerge` requires a real `parentVariantId` —
Phase 0's "no bundle parent product at all" conclusion was wrong. See
docs/BUNDLE_PRODUCT_MODEL.md for the corrected design (one hidden,
unpublished parent variant per Mix & Match offer) and
docs/BUNDLE_LIMITATIONS.md for why native Shopify bundle component caps
turned out not to apply to our Cart-Transform-only approach either. Both
are exactly the kind of thing this iterative, documented process is meant
to catch before it ships broken.

Deferred to a fast-follow within Phase 2 scope (not blocking Phase 3):

- Collection-based selection mode for the Mix & Match pool (schema already
  supports it via `SelectionMode`; builder UI doesn't expose it yet).
- Conflict-check UI actions (`View offer` / `Deactivate offer` / `Continue
  only if safe`) — same gap as Phase 1, the backend check itself works.
- Stacking multiple complete bundles from one cart in a single click — see
  docs/CART_TRANSFORM.md's "deliberate V1 simplification" note.

**Not independently verified end-to-end** — same constraint as Phase 1
(no Shopify Partner org linked in this environment). See
docs/CART_TRANSFORM.md "Verification status" for the exact steps
(deploy, `shopify app function typegen` for both extensions, then the
brief item 90 acceptance test) before treating this phase as done.

## Phase 3 — Mix & Match storefront (built; live verification pending)

Delivered:

- Variant pool caching extended to `title`/`image`/`price` (new
  `OfferVariant.imageCache` column + migration) so the storefront block
  can render a real product grid without extra Admin API calls at render
  time — `app/lib/offers.server.ts`, `app/lib/mix-match-form.server.ts`,
  `app/components/MixMatchBuilder.tsx`.
- Shop-level `mix-match-bundles` display metafield: pure builder
  (`app/lib/shopify/mix-match-display-config.ts`, 5 unit tests) + sync
  layer (`app/lib/shopify/mix-match-display-sync.server.ts`) that does a
  full rewrite on every publish/pause/delete — see
  docs/MIX_MATCH_ENGINE.md "Storefront display metafield".
- Mix & Match Bundle Builder theme block (`extensions/bundlepilot-theme`):
  progress indicator, live pricing (regular/savings/bundle price, tier-aware),
  "Bundle complete ✓" state, Add bundle to cart posting every selected
  variant in one `/cart/add.js` call tagged with `_bp_offer`/`_bp_session`
  line item properties — see docs/THEME_EXTENSION.md "Mix & Match block".
- Cart-removal / quantity-change behavior: no separate invalidation code
  path needed — the Cart Transform function already recomputes from
  scratch on every mutation (brief items 44-45, 81), exercised by the
  Phase 2 Cart Transform unit tests; still needs a live-cart walkthrough.
- "Add BundlePilot to my theme" deep links for both blocks, built from
  `SHOPIFY_API_KEY` at request time (no hardcoded client id), plus a
  copyable Offer ID on the Mix & Match edit page for shops with more than
  one active bundle — `app/routes/app.settings.tsx`,
  `app/routes/app.offers.$id.tsx` (docs/SHOPIFY_COMPLIANCE.md).
- Brief item 90 acceptance scenario (add 3 of 3 required items, verify
  live price preview, add to cart, remove one component) is covered by
  the existing Cart Transform Function unit tests end-to-end at the
  computation layer; the storefront click-through itself is pending live
  verification (see below).

**Not independently verified end-to-end** — same constraint as Phases 1-2
(no Shopify Partner org linked in this environment). See
docs/THEME_EXTENSION.md "Verification status" for the exact steps (deploy,
open a real dev store theme editor, use both deep links, walk the brief
item 90 scenario in an actual cart) before treating this phase as done.

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
