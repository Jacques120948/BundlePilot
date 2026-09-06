# Billing

## Shopify App Pricing, not the Billing API

As of 2026, **Shopify App Pricing** (formerly "Managed Pricing") is
Shopify's recommended and default billing path for new public apps: plans,
prices, and trials are configured in the Partner Dashboard / app
submission form, and Shopify hosts the plan-selection page and handles
charges, proration, and no-charge dev-store testing. The legacy Billing API
(`appSubscriptionCreate` and friends, coded in the app) is now explicitly
marked legacy by Shopify — new apps should not hand-roll it.

BundlePilot therefore does **not** call `appSubscriptionCreate` or any
framework `billing.request()` helper. Instead, per Shopify's integration
guide:

1. Plans (Development/Basic/Pro, docs/BUNDLE_LIMITATIONS.md &
   `app/lib/entitlements.server.ts#DEFAULT_ENTITLEMENTS` for the limits
   attached to each) are defined in the Partner Dashboard during app
   submission setup (Phase 7/9 task, not code).
2. The app checks `activeSubscription` via the Partner API (or
   `currentAppInstallation` for any residual Billing API state during
   migration windows) to determine the merchant's current plan, and gates
   features via `app/lib/entitlements.server.ts`.
3. A merchant without an active subscription is redirected to Shopify's
   hosted plan-selection page (a `redirect()` outside the embedded app
   frame, per the React Router integration pattern) from `app/routes/app.plan.tsx`.
4. No usage-based billing in V1 — all three plans are flat recurring
   prices, so the App Events usage-reporting path isn't needed yet.

This is why `Subscription.plan`/`.status` in `prisma/schema.prisma` are
described as "kept for support and reconciliation" rather than as the
billing system of record — Shopify's own Active Subscription API is the
system of record; our local `Subscription` row is a synced cache we use to
avoid a Partner API round-trip on every request, refreshed via a
short-lived check (implementation detail for Phase 7) and via
`app/scopes_update`/reinstall webhooks.

## Provisional pricing (brief item 67, non-final)

| Plan | Price | Notes |
|---|---|---|
| Development | Free | Full feature access, for `shop.plan_name` development/trial stores (Shopify does not charge for development stores regardless of app config). |
| Basic | $9.99/mo | See `DEFAULT_ENTITLEMENTS.BASIC` for limits. |
| Pro | $19.99/mo | See `DEFAULT_ENTITLEMENTS.PRO` for limits. |

Prices and limits are **not hardcoded** beyond this seed default: they live
in the `FeatureEntitlement` table (editable without a deploy) and the
Partner Dashboard plan configuration (editable without a code change at
all). `app/lib/entitlements.server.ts` is the single place code ever
branches on plan — no `if (plan === "pro")` elsewhere in the codebase
(brief item 69).

## Limits are provisional and configurable

10 active offers (Basic) / 30 (Pro) are starting points, not load-bearing
constants — see docs/BUNDLE_LIMITATIONS.md for why an even higher number
isn't promised as "unlimited" yet (unverified performance/cost at scale).
