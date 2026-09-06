import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook: customers/redact.
 *
 * BundlePilot doesn't persist customer identifiers anywhere (see
 * docs/SHOPIFY_SCOPES.md), so there's no per-customer row to delete. We
 * still record the request for auditability, and respond 200 within the
 * required window.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  const existingShop = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (existingShop) {
    await db.auditLog.create({
      data: {
        shopId: existingShop.id,
        actor: `webhook:${topic}`,
        action: "compliance.customers_redact",
        metadata: { customerId: payload.customer?.id ?? null },
      },
    });
  }

  return new Response(null, { status: 200 });
};
