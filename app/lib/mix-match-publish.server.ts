import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { activateOffer, getOwnedOffer } from "./offers.server";
import type { MixMatchOfferForConfig } from "./shopify/mix-match-config";
import {
  ensureCartTransformActive,
  ensureMixMatchParentVariant,
  syncMixMatchVariantMetafields,
} from "./shopify/mix-match-sync.server";
import { resyncMixMatchBundlesDisplay } from "./shopify/mix-match-display-sync.server";

type OwnedOffer = Awaited<ReturnType<typeof getOwnedOffer>>;

function toConfigOffer(offer: OwnedOffer): MixMatchOfferForConfig {
  if (!offer.shopifyParentVariantId) {
    throw new Error(
      `Offer ${offer.id} has no parent variant yet — publishMixMatchOffer must create one before syncing metafields.`,
    );
  }
  return {
    id: offer.id,
    configVersion: offer.configVersion,
    parentVariantId: offer.shopifyParentVariantId,
    publicTitle: offer.publicTitle,
    minItems: offer.minItems ?? 0,
    maxItems: offer.maxItems ?? 0,
    allowDuplicates: offer.allowDuplicates,
    discountType: offer.discountType as "PERCENTAGE" | "FIXED_AMOUNT" | null,
    discountValue: offer.discountValue === null ? null : Number(offer.discountValue),
    tiers: offer.tiers.map((t) => ({
      quantity: t.quantity,
      discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
      discountValue: Number(t.discountValue),
    })),
    variantIds: offer.variants.map((v) => v.shopifyVariantId),
  };
}

/**
 * Activates a Mix & Match offer end-to-end: DB status + entitlement +
 * conflict checks (offers.server.ts), then every Shopify-side step —
 * hidden parent variant, shop-wide cart transform registration, and
 * variant metafield sync. Each Shopify object is persisted to the
 * database as soon as it's created, so a failure partway through never
 * causes a duplicate parent product or cart transform on retry. If any
 * step fails, the offer itself rolls back to DRAFT rather than staying
 * ACTIVE with an incomplete or absent Shopify-side setup.
 *
 * `previousVariantIds` must be the offer's pool *before* this edit was
 * saved to the database — the caller (the offer route's action) is
 * responsible for capturing it before calling
 * `offers.server.ts#updateMixMatchOffer`, since that call already
 * overwrites the DB pool. Pass `[]` for a brand-new offer.
 */
export async function publishMixMatchOffer(
  admin: AdminGraphqlClient,
  shopId: string,
  offerId: string,
  previousVariantIds: string[],
) {
  await activateOffer(shopId, offerId);
  let offer = await getOwnedOffer(shopId, offerId);

  try {
    if (!offer.shopifyParentVariantId) {
      const parent = await ensureMixMatchParentVariant(admin, {
        id: offer.id,
        publicTitle: offer.publicTitle,
        shopifyParentVariantId: offer.shopifyParentVariantId,
      });
      await db.offer.update({
        where: { id: offer.id },
        data: {
          shopifyParentProductId: parent.productId,
          shopifyParentVariantId: parent.variantId,
        },
      });
      offer = await getOwnedOffer(shopId, offerId);
    }

    const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
    const cartTransformId = await ensureCartTransformActive(admin, shop.cartTransformId);
    if (!shop.cartTransformId) {
      await db.shop.update({ where: { id: shopId }, data: { cartTransformId } });
    }

    await syncMixMatchVariantMetafields(admin, toConfigOffer(offer), previousVariantIds, true);
    await resyncMixMatchBundlesDisplay(admin, shopId);
  } catch (error) {
    await db.offer.update({ where: { id: offer.id }, data: { status: "DRAFT" } });
    throw error;
  }

  return getOwnedOffer(shopId, offerId);
}

/**
 * Pauses a Mix & Match offer: flips every pool variant's bundle-component
 * metafield to `active: false` (rather than deleting it — a cheap,
 * reversible toggle for the common "reactivate later" case) and sets the
 * offer PAUSED.
 */
export async function unpublishMixMatchOffer(
  admin: AdminGraphqlClient,
  shopId: string,
  offerId: string,
) {
  const offer = await getOwnedOffer(shopId, offerId);

  if (offer.variants.length > 0 && offer.shopifyParentVariantId) {
    await syncMixMatchVariantMetafields(admin, toConfigOffer(offer), [], false);
  }

  const paused = await db.offer.update({ where: { id: offerId }, data: { status: "PAUSED" } });
  await resyncMixMatchBundlesDisplay(admin, shopId);
  return paused;
}
