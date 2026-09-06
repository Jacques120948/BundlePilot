import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireTenant(args);
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const baseEditorUrl = `https://${shop.shopDomain}/admin/themes/current/editor`;

  return {
    shopDomain: shop.shopDomain,
    locale: shop.locale,
    apiKey,
    // Deep link formats: see
    // https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-block-deep-linking
    quantityBreakDeepLink: `${baseEditorUrl}?template=product&addAppBlockId=${apiKey}/quantity-break&target=mainSection`,
    // Mix & Match has no single product page of its own, so it targets the
    // generic "Apps" wrapper section, which every JSON template supports —
    // merchants typically add it to a dedicated "Build a bundle" page.
    mixMatchDeepLink: `${baseEditorUrl}?template=page&addAppBlockId=${apiKey}/mix-match&target=newAppsSection`,
  };
};

export default function Settings() {
  const { shopDomain, locale, apiKey, quantityBreakDeepLink, mixMatchDeepLink } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings">
      <s-section heading="Store">
        <s-paragraph>Connected store: {shopDomain}</s-paragraph>
        <s-paragraph>Admin language: {locale}</s-paragraph>
      </s-section>

      <s-section heading="Add BundlePilot to your theme">
        {!apiKey ? (
          <s-paragraph>
            <s-text tone="critical">
              This app isn&apos;t linked to a Partner app yet (no client ID configured), so
              deep links can&apos;t be generated. Run <code>shopify app config link</code> and
              redeploy, then reload this page.
            </s-text>
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Add the Quantity Break block to a product page:
            </s-paragraph>
            <s-button href={quantityBreakDeepLink} target="_blank">
              Add Quantity Break to my theme
            </s-button>
            <s-paragraph>
              Add the Mix &amp; Match builder to a page (create a page such as
              &quot;Build a bundle&quot; first, or add it from any existing page in the
              theme editor):
            </s-paragraph>
            <s-button href={mixMatchDeepLink} target="_blank">
              Add Mix &amp; Match to my theme
            </s-button>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
