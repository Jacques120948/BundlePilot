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

## Why `BundleGroupProduct` is a separate join table

`OfferProduct` already serves double duty (flat Quantity Break/Mix & Match
pool, cached via `offerId` + `shopifyProductId` uniqueness). Grouped
bundles need the *same* product to potentially appear in multiple groups
within one offer (e.g. a versatile product offered as a choice in both
"candle" and "gift" groups) without violating that per-offer uniqueness
constraint or duplicating the cached title/image row. `BundleGroupProduct`
is a plain many-to-many join between `BundleGroup` and `OfferProduct` that
keeps `OfferProduct` as the single deduplicated cache row per product per
offer.

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
