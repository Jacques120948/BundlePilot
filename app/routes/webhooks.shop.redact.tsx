import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook: shop/redact.
 *
 * Sent ~48h after uninstall. Unlike the customer webhooks, BundlePilot DOES
 * hold shop-scoped data (offers, analytics, subscription), so this one does
 * real deletion. Cascading FKs in prisma/schema.prisma take care of child
 * rows (OfferProduct, OfferVariant, OfferTier, BundleGroup, AnalyticsDaily,
 * Subscription, AuditLog) when the Shop row is deleted.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await db.shop.deleteMany({ where: { shopDomain: shop } });
  await db.session.deleteMany({ where: { shop } });

  return new Response(null, { status: 200 });
};
