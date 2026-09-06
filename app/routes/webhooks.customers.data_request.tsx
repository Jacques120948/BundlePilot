import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook: customers/data_request.
 *
 * BundlePilot does not store customer PII (see docs/SHOPIFY_SCOPES.md "Data
 * minimization") — offers, bundles, and analytics are all shop- and
 * product-scoped, never customer-scoped. There is nothing to hand back to
 * the store owner beyond an audit trail entry confirming the request was
 * received, which is what a manual review of this webhook's payload would
 * need if a merchant asks "did you have anything on this customer".
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  const existingShop = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (existingShop) {
    await db.auditLog.create({
      data: {
        shopId: existingShop.id,
        actor: `webhook:${topic}`,
        action: "compliance.customers_data_request",
        metadata: { customerId: payload.customer?.id ?? null },
      },
    });
  }

  return new Response(null, { status: 200 });
};
