import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireTenant } from "../lib/tenant.server";
import { getEntitlementsForShop } from "../lib/entitlements.server";
import db from "../db.server";
import { BRAND } from "../lib/branding";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireTenant(args);
  const entitlements = await getEntitlementsForShop(shop.id);
  const activeOfferCount = await db.offer.count({
    where: { shopId: shop.id, status: "ACTIVE" },
  });

  return { entitlements, activeOfferCount };
};

export default function Index() {
  const { entitlements, activeOfferCount } = useLoaderData<typeof loader>();

  return (
    <s-page heading={`${BRAND.name}`}>
      <s-section heading="Active bundles">
        <s-paragraph>
          {activeOfferCount} / {entitlements.maxActiveOffers} active offers on
          your plan.
        </s-paragraph>
        <s-link href="/app/offers/new">Create a bundle</s-link>
      </s-section>

      <s-section heading="Get started">
        <s-paragraph>
          {BRAND.tagline} Create a Quantity Break, a Mix &amp; Match bundle, or
          a Grouped Mix &amp; Match, then add the BundlePilot block to your
          theme.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/offers/new">Create Bundle</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/offers">View offers</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/analytics">View analytics</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
