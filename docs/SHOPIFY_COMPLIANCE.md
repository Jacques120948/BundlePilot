# Shopify App Store compliance

Living checklist, maintained throughout development (brief item 6). Status
reflects Phase 0; items get checked off as later phases implement them.
Shopify's own documentation always overrides this file if they've diverged
— re-verify before submission (Phase 9).

## Embedded app / authentication

- [x] Built on `@shopify/shopify-app-react-router`, `AppDistribution.AppStore`.
- [x] Embedded (`embedded = true` in `shopify.app.toml`), uses App Bridge
      (`AppProvider` + session-token auth via `authenticate.admin`).
- [x] OAuth handled entirely by the framework (`/auth/*` route) — no custom
      OAuth code.
- [ ] Verify CSP/document response headers are applied to every HTML route
      (`shopify.addDocumentResponseHeaders`) — currently only wired on
      routes that call it explicitly; audit in Phase 1.

## API usage

- [x] GraphQL Admin API only; no REST Admin API calls anywhere in the code
      base (verify again before each phase ships new server code).
- [x] Minimum access scopes requested — see docs/SHOPIFY_SCOPES.md.
- [x] Discount creation goes through the embedded app's own UI, never a
      generic "create discount" link that lands outside the app (App Store
      discount-app requirement) — enforced by design in Phase 1 (Offer
      builder is the only discount-creation surface).
- [x] No draft orders used to apply custom discounts (we don't create draft
      orders at all in V1).
- [x] No dynamic editing/execution of Function code from the app (Functions
      are compiled and deployed with the app, not user-editable code).

## Webhooks

- [x] `app/uninstalled`, `app/scopes_update` implemented (from template).
- [x] Mandatory compliance webhooks implemented and HMAC-verified via
      `authenticate.webhook` (which validates the HMAC and returns 401 on
      failure per Shopify's requirement) — see
      `app/routes/webhooks.customers.data_request.tsx`,
      `webhooks.customers.redact.tsx`, `webhooks.shop.redact.tsx`.
- [ ] Automated tests asserting a bad HMAC yields 401 — tracked for Phase 1
      test suite (docs/SECURITY.md "Webhook verification").

## Privacy / data minimization

- [x] No `read_customers`/`write_customers` scope requested; no customer
      PII stored anywhere in `prisma/schema.prisma`. See
      docs/SHOPIFY_SCOPES.md "Data minimization".
- [x] Analytics events are anonymous, shop+offer+date aggregates
      (`AnalyticsDaily`) — no session/customer identifiers.
- [ ] Privacy policy URL configured in Partner Dashboard listing (Phase 9).

## Billing

- [ ] Shopify App Pricing configured in the Partner Dashboard/submission
      form (not the legacy Billing API) — see docs/BILLING.md. Tracked for
      Phase 7.

## Checkout / discounts

- [x] No checkout bypass: all discounts flow through Shopify's own discount
      and cart-transform mechanisms; BundlePilot never redirects to an
      external checkout or computes a "final price" the customer pays
      outside Shopify Checkout.
- [x] Discount logic re-verified server-side by Shopify Functions, not
      trusted from the client — see docs/SECURITY.md "Cart security".

## Theme App Extensions

- [x] App blocks (not legacy ScriptTag/Asset injection) for storefront UI —
      Quantity Break block shipped in Phase 1, Mix & Match block shipped in
      Phase 3 (extensions/bundlepilot-theme); Phase 4 extended that same
      Mix & Match block with a step-by-step flow for Grouped Mix & Match
      (docs/THEME_EXTENSION.md "Grouped Mix & Match step-by-step flow").
      No ScriptTag/Asset REST calls anywhere in the code base.
- [x] "Add to my theme" deep link implemented (Phase 3) — see
      `app/routes/app.settings.tsx` and docs/THEME_EXTENSION.md "Adding the
      blocks to a theme"; not yet clicked through on a real dev store (see
      that doc's "Verification status").

## Design / UX

- [x] Admin UI uses Polaris web components exclusively (no custom
      component library) — true through Phase 1's Offer builder as well as
      the Phase 0 scaffold; keep true through later phases.
- [ ] Mobile-responsive admin and storefront widget verified at 320/375/430
      px + tablet/desktop (Phase 5).
- [ ] Accessibility pass (keyboard nav, ARIA, contrast) — Phase 5.

## Re-verification process

Before Phase 9 submission: re-run Shopify's official app review
requirements pages (`shopify.dev/docs/apps/launch/shopify-app-store/*`) end
to end and use the Shopify AI Toolkit / built-in self-review mechanism
available at that time (brief item 96) to catch anything this checklist
missed or that shipped after it was written.
