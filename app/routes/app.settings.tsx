import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireTenant(args);
  return { shopDomain: shop.shopDomain, locale: shop.locale };
};

export default function Settings() {
  const { shopDomain, locale } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings">
      <s-section heading="Store">
        <s-paragraph>Connected store: {shopDomain}</s-paragraph>
        <s-paragraph>Admin language: {locale}</s-paragraph>
      </s-section>
      <s-section heading="Add BundlePilot to your theme">
        <s-paragraph>
          Add the BundlePilot block to your product pages from the Shopify
          theme editor.
        </s-paragraph>
        <s-button
          href="shopify://admin/themes/current/editor?context=apps"
          target="_blank"
        >
          Add BundlePilot to my theme
        </s-button>
      </s-section>
    </s-page>
  );
}
