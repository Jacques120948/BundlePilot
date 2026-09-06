import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { activateOffer, getOwnedOffer } from "./offers.server";
import {
  buildBundleComponentConfig,
  buildGroupedBundleComponentConfig,
  collectGroupedVariantIds,
  type BundleComponentConfig,
} from "./shopify/mix-match-config";
import {
  ensureCartTransformActive,
  ensureMixMatchParentVariant,
  syncBundleComponentMetafields,
} from "./shopify/mix-match-sync.server";
import { resyncMixMatchBundlesDisplay } from "./shopify/mix-match-display-sync.server";

type OwnedOffer = Awaited<ReturnType<typeof getOwnedOffer>>;

/**
 * Builds the denormalized config plus the full list of variant ids it must
 * be written to, branching on offer type — flat Mix & Match uses its own
 * pool/minItems/maxItems/allowDuplicates fields, Grouped Mix & Match
 * derives everything from its BundleGroup rows instead. Everything else
 * about publishing (parent variant, cart transform, metafield write) is
 * identical for both — see docs/MIX_MATCH_ENGINE.md "Grouped bundles".
 */
function buildConfigAndVariantIds(
  offer: OwnedOffer,
  active: boolean,
): { config: BundleComponentConfig; variantIds: string[] } {
  if (!offer.shopifyParentVariantId) {
    throw new Error(
      `Offer ${offer.id} has no parent variant yet — publishMixMatchOffer must create one before syncing metafields.`,
    );
  }

  const tiers = offer.tiers.map((t) => ({
    quantity: t.quantity,
    discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
    discountValue: Number(t.discountValue),
  }));
  const discountType = offer.discountType as "PERCENTAGE" | "FIXED_AMOUNT" | null;
  const discountValue = offer.discountValue === null ? null : Number(offer.discountValue);

  if (offer.type === "MIX_MATCH_GROUPED") {
    const groups = offer.groups.map((g) => ({
      id: g.id,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      required: g.required,
      allowDuplicates: g.allowDuplicates,
      variantIds: g.variants.map((v) => v.shopifyVariantId),
    }));
    const config = buildGroupedBundleComponentConfig(
      {
        id: offer.id,
        configVersion: offer.configVersion,
        parentVariantId: offer.shopifyParentVariantId,
        publicTitle: offer.publicTitle,
        discountType,
        discountValue,
        tiers,
        groups,
      },
      active,
    );
    return { config, variantIds: collectGroupedVariantIds(groups) };
  }

  const variantIds = offer.variants.map((v) => v.shopifyVariantId);
  const config = buildBundleComponentConfig(
    {
      id: offer.id,
      configVersion: offer.configVersion,
      parentVariantId: offer.shopifyParentVariantId,
      publicTitle: offer.publicTitle,
      minItems: offer.minItems ?? 0,
      maxItems: offer.maxItems ?? 0,
      allowDuplicates: offer.allowDuplicates,
      discountType,
      discountValue,
      tiers,
      variantIds,
    },
    active,
  );
  return { config, variantIds };
}

/**
 * Activates a Mix & Match or Grouped Mix & Match offer end-to-end: DB
 * status + entitlement + conflict checks (offers.server.ts), then every
 * Shopify-side step — hidden parent variant, shop-wide cart transform
 * registration, and variant metafield sync. Each Shopify object is
 * persisted to the database as soon as it's created, so a failure partway
 * through never causes a duplicate parent product or cart transform on
 * retry. If any step fails, the offer itself rolls back to DRAFT rather
 * than staying ACTIVE with an incomplete or absent Shopify-side setup.
 * Both offer types share this one function since everything past "how is
 * the config built" (buildConfigAndVariantIds, above) is identical.
 *
 * `previousVariantIds` must be the offer's pool/groups *before* this edit
 * was saved to the database — the caller (the offer route's action) is
 * responsible for capturing it before calling
 * `offers.server.ts#updateMixMatchOffer` / `updateMixMatchGroupedOffer`,
 * since that call already overwrites the DB pool. Pass `[]` for a
 * brand-new offer.
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

    const { config, variantIds } = buildConfigAndVariantIds(offer, true);
    await syncBundleComponentMetafields(admin, config, variantIds, previousVariantIds);
    await resyncMixMatchBundlesDisplay(admin, shopId);
  } catch (error) {
    await db.offer.update({ where: { id: offer.id }, data: { status: "DRAFT" } });
    throw error;
  }

  return getOwnedOffer(shopId, offerId);
}

/**
 * Pauses a Mix & Match or Grouped Mix & Match offer: flips every pool/group
 * variant's bundle-component metafield to `active: false` (rather than
 * deleting it — a cheap, reversible toggle for the common "reactivate
 * later" case) and sets the offer PAUSED.
 */
export async function unpublishMixMatchOffer(
  admin: AdminGraphqlClient,
  shopId: string,
  offerId: string,
) {
  const offer = await getOwnedOffer(shopId, offerId);

  if (offer.variants.length > 0 && offer.shopifyParentVariantId) {
    const { config, variantIds } = buildConfigAndVariantIds(offer, false);
    await syncBundleComponentMetafields(admin, config, variantIds, []);
  }

  const paused = await db.offer.update({ where: { id: offerId }, data: { status: "PAUSED" } });
  await resyncMixMatchBundlesDisplay(admin, shopId);
  return paused;
}
