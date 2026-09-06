# BundlePilot

A public, embedded Shopify app for **Quantity Breaks** and **Mix & Match
bundles** — built on the Shopify CLI React Router template, PostgreSQL +
Prisma, and Shopify Functions (Discount API + Cart Transform API) so every
discount is enforced server-side, not just displayed.

> "BundlePilot" is a working name. Branding is centralized in
> `app/lib/branding.ts` so it can be renamed with a single edit.

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/ROADMAP.md](docs/ROADMAP.md) for the full picture. All Shopify
platform decisions (APIs, scopes, limitations, security model) are recorded
under [docs/](docs/) and are meant to be kept current as the app evolves.

## Offer types (V1)

- **Quantity Break** — buy more of one product, save more (1/2/3/4 units →
  0/10/15/20%), enforced by a Shopify Discount Function.
- **Mix & Match** — customer builds a bundle from a merchant-chosen pool of
  products/variants from any collection, enforced by a Shopify Cart
  Transform Function.
- **Grouped Mix & Match** — a stepped version of the above ("choose 1
  candle, choose 1 bracelet, choose 1 care product").

See [docs/BUNDLE_ARCHITECTURE.md](docs/BUNDLE_ARCHITECTURE.md) and
[docs/MIX_MATCH_ENGINE.md](docs/MIX_MATCH_ENGINE.md) for how these work,
and [docs/SECURITY.md](docs/SECURITY.md) for why the storefront widget is
never trusted to compute the actual discount.

## Local development

### Prerequisites

- Node.js `>=20.19 <22 || >=22.12`
- A PostgreSQL 14+ database
- A Shopify Partner account + development store, and the
  [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) (installed as a
  dev dependency; run via `npm run shopify` / `npm run dev`)

### Setup

```sh
cp .env.example .env   # fill in DATABASE_URL at minimum for local scripts
npm install
npx prisma migrate deploy   # or `prisma migrate dev` while iterating on the schema
npx prisma db seed          # populates FeatureEntitlement defaults
```

### Run the app

```sh
npm run dev
```

`shopify app dev` will prompt you to link/create an app in your Partner
org on first run (this also fills in `client_id`/`application_url` in
`shopify.app.toml` and provisions a tunnel URL) and installs it on your
chosen development store.

### Checks (run before every commit / phase handoff)

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

CI (`.github/workflows/ci.yml`) runs the same four steps against a real
Postgres service container on every push/PR.

## Project layout

```
app/
  routes/            React Router routes (admin UI + webhooks)
  lib/               Server-side helpers: tenant scoping, entitlements,
                     branding, offer-type registry
  shopify.server.ts  Shopify app configuration (@shopify/shopify-app-react-router)
prisma/
  schema.prisma      Full V1 data model
  seed.ts            FeatureEntitlement defaults
extensions/          Shopify Functions + Theme App Extension (added from Phase 1 on)
docs/                Architecture, compliance, and design-decision records
```

## Contributing / conventions

- No REST Admin API calls — GraphQL Admin API only (see
  [docs/SHOPIFY_COMPLIANCE.md](docs/SHOPIFY_COMPLIANCE.md)).
- Every server query touching business data must be scoped by `shopId` via
  `app/lib/tenant.server.ts` (see
  [docs/SECURITY.md](docs/SECURITY.md#multi-tenant-isolation)).
- Plan-based feature gating goes through `app/lib/entitlements.server.ts`
  — never `if (plan === "pro")` inline.
