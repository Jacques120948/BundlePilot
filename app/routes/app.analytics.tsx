import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import db from "../db.server";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireTenant(args);

  const totals = await db.analyticsDaily.aggregate({
    where: { shopId: shop.id },
    _sum: { views: true, starts: true, completions: true, addToCarts: true },
  });

  return {
    views: totals._sum.views ?? 0,
    starts: totals._sum.starts ?? 0,
    completions: totals._sum.completions ?? 0,
    addToCarts: totals._sum.addToCarts ?? 0,
  };
};

export default function Analytics() {
  const { views, starts, completions, addToCarts } =
    useLoaderData<typeof loader>();

  const completionRate = starts > 0 ? Math.round((completions / starts) * 100) : 0;

  return (
    <s-page heading="Analytics">
      <s-section heading="Bundle performance">
        <s-stack direction="inline" gap="large">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="neutral">Widget views</s-text>
            <s-heading>{views}</s-heading>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="neutral">Bundles started</s-text>
            <s-heading>{starts}</s-heading>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="neutral">Bundles completed</s-text>
            <s-heading>{completions}</s-heading>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="neutral">Added to cart</s-text>
            <s-heading>{addToCarts}</s-heading>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="neutral">Completion rate</s-text>
            <s-heading>{completionRate}%</s-heading>
          </s-box>
        </s-stack>
      </s-section>
      <s-section heading="No personal data">
        <s-paragraph>
          These counters are anonymous, shop- and offer-scoped events. See
          docs/SHOPIFY_SCOPES.md for what BundlePilot does and does not
          collect.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
