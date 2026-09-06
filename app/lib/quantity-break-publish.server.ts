import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { activateOffer, getOwnedOffer } from "./offers.server";
import {
  pauseQuantityBreakDiscount,
  resumeQuantityBreakDiscount,
  syncQuantityBreakDiscount,
  syncQuantityBreakDisplayMetafields,
} from "./shopify/quantity-break-sync.server";

/**
 * Activates a Quantity Break offer end-to-end: DB status + entitlement +
 * conflict checks (offers.server.ts), then the Shopify-side discount and
 * display metafield sync (quantity-break-sync.server.ts). If any Shopify
 * call fails, the offer is rolled back to DRAFT rather than left ACTIVE
 * with no real discount behind it.
 */
export async function publishQuantityBreakOffer(
  admin: AdminGraphqlClient,
  shopId: string,
  offerId: string,
) {
  await activateOffer(shopId, offerId);
  const offer = await getOwnedOffer(shopId, offerId);

  try {
    const discountId = await syncQuantityBreakDiscount(admin, {
      offerId: offer.id,
      publicTitle: offer.publicTitle,
      shopifyDiscountId: offer.shopifyDiscountId,
      productIds: offer.products.map((p) => p.shopifyProductId),
      tiers: offer.tiers.map((t) => ({
        quantity: t.quantity,
        discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
        discountValue: Number(t.discountValue),
      })),
      startsAt: offer.startsAt,
      endsAt: offer.endsAt,
      combinesWith: {
        orderDiscounts: offer.combinesWithOrderDiscounts,
        productDiscounts: offer.combinesWithProductDiscounts,
        shippingDiscounts: offer.combinesWithShippingDiscounts,
      },
    });

    if (offer.shopifyDiscountId && offer.status === "PAUSED") {
      await resumeQuantityBreakDiscount(admin, offer.shopifyDiscountId);
    }

    await db.offer.update({
      where: { id: offer.id },
      data: { shopifyDiscountId: discountId },
    });

    await syncQuantityBreakDisplayMetafields(
      admin,
      offer.id,
      offer.publicTitle,
      offer.products.map((p) => p.shopifyProductId),
      offer.tiers.map((t) => ({
        quantity: t.quantity,
        discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
        discountValue: Number(t.discountValue),
      })),
    );
  } catch (error) {
    await db.offer.update({ where: { id: offer.id }, data: { status: "DRAFT" } });
    throw error;
  }

  return getOwnedOffer(shopId, offerId);
}

export async function unpublishQuantityBreakOffer(
  admin: AdminGraphqlClient,
  shopId: string,
  offerId: string,
) {
  const offer = await getOwnedOffer(shopId, offerId);
  if (offer.shopifyDiscountId) {
    await pauseQuantityBreakDiscount(admin, offer.shopifyDiscountId);
  }
  return db.offer.update({ where: { id: offerId }, data: { status: "PAUSED" } });
}
