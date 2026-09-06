import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import { getEntitlementsForShop } from "../lib/entitlements.server";
import db from "../db.server";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireTenant(args);
  const entitlements = await getEntitlementsForShop(shop.id);
  const subscription = await db.subscription.findUnique({
    where: { shopId: shop.id },
  });

  return { plan: subscription?.plan ?? "DEVELOPMENT", entitlements };
};

export default function Plan() {
  const { plan, entitlements } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Plan">
      <s-section heading="Current plan">
        <s-paragraph>You&apos;re on the {plan} plan.</s-paragraph>
        <s-unordered-list>
          <s-list-item>
            Up to {entitlements.maxActiveOffers} active bundles
          </s-list-item>
          <s-list-item>
            Mix &amp; Match: {entitlements.canCreateMixMatch ? "included" : "not included"}
          </s-list-item>
          <s-list-item>
            Grouped Mix &amp; Match:{" "}
            {entitlements.canCreateGroupedBundle ? "included" : "not included"}
          </s-list-item>
          <s-list-item>Analytics: {entitlements.analyticsLevel}</s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section heading="Billing">
        <s-paragraph>
          Plan upgrades are configured through Shopify App Pricing — see
          docs/BILLING.md. This screen will link to the hosted plan selection
          page once billing ships in Phase 7.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
