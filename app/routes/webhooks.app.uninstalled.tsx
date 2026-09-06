import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Deactivate the shop but keep its data: Shopify sends shop/redact ~48h
  // later, which is when we actually purge it (see
  // webhooks.shop.redact.tsx). This also stops the offer builder / storefront
  // API routes from serving a shop that no longer has the app installed.
  const existingShop = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (existingShop) {
    await db.shop.update({
      where: { id: existingShop.id },
      data: { active: false, uninstalledAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        shopId: existingShop.id,
        actor: `webhook:${topic}`,
        action: "shop.uninstalled",
      },
    });
  }

  return new Response();
};
