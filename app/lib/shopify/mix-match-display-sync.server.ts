import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import db from "../../db.server";
import { METAFIELD_NAMESPACE_APP, METAFIELD_KEYS } from "./metafields";
import {
  buildGroupedMixMatchBundlesDisplay,
  buildMixMatchBundlesDisplay,
  type MixMatchBundlesDisplay,
} from "./mix-match-display-config";

interface UserError {
  field: string[];
  message: string;
}

async function getShopGid(admin: AdminGraphqlClient): Promise<string> {
  const response = await admin(`#graphql
    query ShopGid {
      shop { id }
    }`);
  const json = (await response.json()) as { data?: { shop?: { id: string } } };
  const id = json.data?.shop?.id;
  if (!id) throw new Error("Could not resolve the shop's GraphQL ID.");
  return id;
}

/**
 * Rebuilds the shop-level `mix-match-bundles` display metafield from
 * scratch, from every currently ACTIVE Mix & Match / Grouped Mix & Match
 * offer in our database (the two are merged into one map, keyed by offer
 * id). Always a full rewrite (not an incremental patch) — simple and
 * correct at the offer counts our plans allow (10-30, see
 * docs/BILLING.md), and it means publishing, pausing, or deleting any one
 * offer can just call this rather than tracking a diff. See
 * docs/MIX_MATCH_ENGINE.md "Storefront display metafield".
 */
export async function resyncMixMatchBundlesDisplay(
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<void> {
  const [flatOffers, groupedOffers] = await Promise.all([
    db.offer.findMany({
      where: { shopId, type: "MIX_MATCH", status: "ACTIVE" },
      include: { tiers: { orderBy: { quantity: "asc" } }, variants: true },
    }),
    db.offer.findMany({
      where: { shopId, type: "MIX_MATCH_GROUPED", status: "ACTIVE" },
      include: {
        tiers: { orderBy: { quantity: "asc" } },
        groups: { orderBy: { sortOrder: "asc" }, include: { variants: true } },
      },
    }),
  ]);

  const flatDisplay = buildMixMatchBundlesDisplay(
    flatOffers.map((offer) => ({
      id: offer.id,
      publicTitle: offer.publicTitle,
      description: offer.description,
      minItems: offer.minItems ?? 0,
      maxItems: offer.maxItems ?? 0,
      allowDuplicates: offer.allowDuplicates,
      discountType: offer.discountType as "PERCENTAGE" | "FIXED_AMOUNT" | null,
      discountValue: offer.discountValue === null ? null : Number(offer.discountValue),
      tiers: offer.tiers.map((t) => ({
        quantity: t.quantity,
        discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
        discountValue: Number(t.discountValue),
        label: t.label,
      })),
      variants: offer.variants.map((v) => ({
        shopifyVariantId: v.shopifyVariantId,
        titleCache: v.titleCache,
        imageCache: v.imageCache,
        priceCache: v.priceCache === null ? null : Number(v.priceCache),
      })),
    })),
  );

  const groupedDisplay = buildGroupedMixMatchBundlesDisplay(
    groupedOffers.map((offer) => ({
      id: offer.id,
      publicTitle: offer.publicTitle,
      description: offer.description,
      discountType: offer.discountType as "PERCENTAGE" | "FIXED_AMOUNT" | null,
      discountValue: offer.discountValue === null ? null : Number(offer.discountValue),
      tiers: offer.tiers.map((t) => ({
        quantity: t.quantity,
        discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
        discountValue: Number(t.discountValue),
        label: t.label,
      })),
      groups: offer.groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections,
        required: g.required,
        allowDuplicates: g.allowDuplicates,
        variants: g.variants.map((v) => ({
          shopifyVariantId: v.shopifyVariantId,
          titleCache: v.titleCache,
          imageCache: v.imageCache,
          priceCache: v.priceCache === null ? null : Number(v.priceCache),
        })),
      })),
    })),
  );

  const display: MixMatchBundlesDisplay = { ...flatDisplay, ...groupedDisplay };

  const shopGid = await getShopGid(admin);
  const response = await admin(
    `#graphql
      mutation SyncMixMatchBundlesDisplay($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: METAFIELD_NAMESPACE_APP,
            key: METAFIELD_KEYS.mixMatchBundlesDisplay,
            type: "json",
            value: JSON.stringify(display),
          },
        ],
      },
    },
  );
  const json = (await response.json()) as {
    data?: { metafieldsSet?: { userErrors: UserError[] } };
  };
  const errors = json.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Failed to sync Mix & Match display metafield: ${JSON.stringify(errors)}`);
  }
}
