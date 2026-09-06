# Security

## Multi-tenant isolation

Every business-data table has a `shopId` FK to `Shop` (prisma/schema.prisma).
Rules:

- Every admin route loader/action must call
  `app/lib/tenant.server.ts#requireTenant` (which wraps `authenticate.admin`
  and resolves the `Shop` row) and use its returned `shop.id` in every
  query — never accept a `shopId`/`offerId` from a route param or form
  field without also checking it belongs to the authenticated shop (e.g.
  `db.offer.findFirst({ where: { id, shopId } })`, not
  `db.offer.findUnique({ where: { id } })`).
- Webhook handlers resolve the shop from the **verified** webhook payload's
  `shop` domain (via `authenticate.webhook`, which validates the HMAC
  before handler code runs — see "Webhook verification" below), never from
  a client-supplied header.
- Tests: Phase 1 adds an integration test that asserts shop A's session
  cannot read/mutate shop B's `Offer` rows through any route.

## Cart security ("never trust the browser")

Line item properties/cart attributes the storefront widget sets
(`_bp_offer`, `_bp_session`) are **routing hints only**. The actual
discount decision is always re-derived server-side inside a Shopify
Function from data the Function fetches itself (variant metafields for Mix
& Match, discount metafields for Quantity Break) — see
docs/MIX_MATCH_ENGINE.md and docs/DISCOUNT_ENGINE.md for the exact
per-offer-type mechanics. Concretely, this means:

- The widget never sends a discount percentage, price, or "valid" flag
  that the Function trusts.
- A tampered property can only cause a line to be **excluded** from a
  bundle (fail closed), never included with an unearned discount.
- The worked "cheat test" (brief item 80): a customer edits `_bp_offer`
  or adds a fake `_bp_discount=50` attribute — the Cart Transform function
  doesn't read any such field, so the discount stays at whatever the
  merchant's `bundle-component` metafield says (15% in the example),
  regardless of what the browser sent. This should become an explicit
  Function fixture test in Phase 2 (docs/BUNDLE_LIMITATIONS.md-adjacent
  test fixtures, tracked in the Phase 2 test plan).

## Webhook verification

`authenticate.webhook(request)` (from `@shopify/shopify-app-react-router`)
verifies the `X-Shopify-Hmac-Sha256` header against the app's client secret
before handler code runs, and throws (translated to a 401) on mismatch —
this satisfies the mandatory-webhook HMAC requirement
(docs/SHOPIFY_COMPLIANCE.md) without any custom crypto code. Every webhook
route in this app must go through this helper; never read `request.json()`
directly on a webhook route.

## Input validation / output encoding

- All admin form input is validated server-side before it reaches Prisma
  (bounds checks in docs/BUNDLE_ARCHITECTURE.md "Admin validation") —
  client-side validation is UX only.
- React auto-escapes interpolated content in the admin; we do not use
  `dangerouslySetInnerHTML`. The storefront Theme App Extension is plain
  Liquid + vanilla JS — Liquid auto-escapes by default, and
  `quantity-break.js` never uses `innerHTML`: merchant-authored strings
  (offer title, tier labels) and computed numbers alike are inserted via
  `textContent`/`createTextNode`, so a merchant typing HTML into a tier
  label can't inject markup into their own storefront.
- Prisma's parameterized queries are used exclusively — no raw SQL string
  concatenation anywhere in the codebase.

## Secrets

- `SHOPIFY_API_SECRET`, `DATABASE_URL` live only in environment variables
  (`.env`, never committed — see `.gitignore`), read via `process.env`.
  Never logged (see docs/ARCHITECTURE.md "Observability", added in a later
  phase alongside real logging).
- No secret is ever sent to the storefront/browser bundle.

## Rate limiting / abuse

Admin routes ride on Shopify's own GraphQL Admin API rate limits for
outbound calls; no additional app-level rate limiting is needed in V1
since there's no unauthenticated write surface (the only public routes are
the mandatory webhooks, which are HMAC-gated, and the Storefront-API-backed
theme extension, which only reads public product data and our metafields).

## Headers

`shopify.addDocumentResponseHeaders` must be called on every route that
renders HTML, to set the CSP `frame-ancestors` directive required for the
app to embed correctly and securely in Shopify Admin. Tracked as an audit
item in docs/SHOPIFY_COMPLIANCE.md.
