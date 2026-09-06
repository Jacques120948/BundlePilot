import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import type { Shop } from "@prisma/client";

/**
 * Every admin route must call this instead of `authenticate.admin` directly.
 *
 * It authenticates the request AND resolves/creates the tenant-scoped `Shop`
 * row, so route code always has a `shopId` to filter every query by. Never
 * query Offer/Analytics/Subscription/etc. tables without `where: { shopId }`
 * (or a relation that is itself scoped to shopId) — see docs/SECURITY.md
 * "Multi-tenant isolation".
 */
export async function requireTenant(
  args: LoaderFunctionArgs | ActionFunctionArgs,
) {
  const { admin, session } = await authenticate.admin(args.request);

  const shop = await db.shop.upsert({
    where: { shopDomain: session.shop },
    create: { shopDomain: session.shop },
    update: { active: true, uninstalledAt: null },
  });

  return { admin, session, shop };
}

/** Narrow helper for code that already has a shop domain (e.g. webhooks). */
export async function findShopByDomain(shopDomain: string): Promise<Shop | null> {
  return db.shop.findUnique({ where: { shopDomain } });
}
