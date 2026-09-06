# Database

PostgreSQL via Prisma. See `prisma/schema.prisma` for the authoritative
definitions; this doc explains the *why* behind non-obvious choices.

## Why Postgres over the template's default SQLite

The scaffolded React Router template defaults to SQLite for zero-setup
local dev. BundlePilot switches to Postgres from Phase 0 because:

- it's the multi-tenant production target from day one (brief item 58),
  and testing against the same engine used in production catches
  Postgres-specific behavior (enum types, `Decimal`, cascading deletes at
  scale) earlier;
- `Decimal` columns (money: `discountValue`, `priceCache`) need real fixed
  precision arithmetic, which Prisma's SQLite adapter emulates less
  faithfully than native Postgres `NUMERIC`.

Local dev and CI both run a real Postgres instance (see root `README.md`
and `.github/workflows/ci.yml`) rather than mocking the database, since
Prisma's generated client behavior differs meaningfully by provider.

## Tenant boundary

`Shop.id` is the tenant key. Every table below `Shop` cascades on delete
(`onDelete: Cascade`) so that removing a `Shop` row (triggered by the
`shop/redact` compliance webhook, see docs/SHOPIFY_COMPLIANCE.md) fully and
automatically purges that shop's offers, analytics, subscription, and audit
log — no manual multi-table delete script to keep in sync with schema
changes.

## Caching Shopify data

`OfferProduct.titleCache`/`imageCache` and `OfferVariant.priceCache` exist
purely so the admin offer list/builder can render without an extra
round-trip on every page load. They are refreshed opportunistically
(on offer open/save) and **never** used for discount math or storefront
pricing — Shopify's live product/variant data (fetched via GraphQL Admin
API server-side, or Storefront API client-side) is always the source of
truth for anything price- or availability-related, per brief item 61.

## Why `BundleGroupProduct` is a separate join table (reserved, not yet wired up)

`OfferProduct` already serves double duty (flat Quantity Break pool,
cached via `offerId` + `shopifyProductId` uniqueness). `BundleGroupProduct`
was modeled in Phase 0 as a many-to-many join between `BundleGroup` and
`OfferProduct`, anticipating a future `selectionMode = COLLECTION` for
Grouped Mix & Match where the *same* product could be offered as a choice
in more than one group.

**Correction from Phase 4 implementation**: the shipped Grouped Mix &
Match builder uses manual variant selection only (matching flat Mix &
Match's `MANUAL` mode — brief item 2's "never force a collection"), so
groups are populated directly via `OfferVariant.bundleGroupId`, not
`BundleGroupProduct`/`OfferProduct`. Phase 4 also validates that **a given
variant can only belong to one group per offer** (`validateMixMatchGroupedOffer`
in `app/lib/validation/mix-match-grouped.ts`) — the opposite of what this
table was modeled for — because letting one variant satisfy two groups
would make the Cart Transform function's per-line group lookup ambiguous
(see docs/MIX_MATCH_ENGINE.md "Grouped bundles" — "One variant, one
group"). `BundleGroupProduct` stays in the schema, unused, as the landing
spot for a future collection-based grouped selection mode; it is not a
dead-code cleanup target.

## Shopify object references added in Phase 2

`Shop.cartTransformId` and `Offer.shopifyParentProductId` /
`shopifyParentVariantId` cache Shopify object IDs the app creates on first
Mix & Match publish (docs/BUNDLE_PRODUCT_MODEL.md, docs/CART_TRANSFORM.md).
`Offer.configVersion` is bumped on every Mix & Match edit and denormalized
into the `bundle-component` variant metafield as `offerVersion`, so the
Cart Transform function can detect a cart line still carrying a stale
snapshot mid-propagation (docs/MIX_MATCH_ENGINE.md). None of these are
used for discount math themselves — they're lookup keys the sync layer
uses to avoid recreating Shopify objects that already exist.

## `OfferVariant` uniqueness is enforced in application code, not the database

`@@unique([offerId, shopifyVariantId, bundleGroupId])` does **not** stop a
flat-pool offer (where `bundleGroupId` is always `NULL`) from getting the
same variant inserted twice — SQL's `NULL <> NULL` means a unique
constraint never fires across rows that are all `NULL` in one of its
columns. This is a known, deliberate gap: `app/lib/offers.server.ts`
always replaces an offer's entire pool (`deleteMany` then `createMany`)
from a single validated request rather than doing incremental inserts, so
the application never has a code path that could produce a duplicate row
in the first place — `app/lib/validation/mix-match.ts` also explicitly
rejects a pool with a repeated variant before any database write happens.
If a future phase adds incremental pool edits (add/remove one variant at a
time instead of resubmitting the whole form), revisit this — a partial
unique index (`WHERE "bundleGroupId" IS NULL`) would be the fix.

## Enums vs. free strings

`OfferType`, `OfferStatus`, `DiscountType`, `SelectionMode`, `PlanTier` are
Postgres enums (via Prisma `enum`) rather than strings, so invalid values
are rejected at the database layer as a second line of defense behind
application-level validation (docs/BUNDLE_ARCHITECTURE.md "Admin
validation").

## Migrations

Managed by `prisma migrate`. `npm run setup` (`prisma generate && prisma
migrate deploy`) is the production/CI migration entrypoint; local
development uses `prisma migrate dev`. The seed script
(`prisma/seed.ts`) populates `FeatureEntitlement` defaults from
`app/lib/entitlements.server.ts#DEFAULT_ENTITLEMENTS` — the single source
of truth for plan limits (docs/BILLING.md).
