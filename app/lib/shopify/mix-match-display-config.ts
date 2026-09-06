/**
 * Builds the shop-level `mix-match-bundles` display metafield value — see
 * docs/MIX_MATCH_ENGINE.md "Storefront display metafield". Unlike the
 * enforcement `bundle-component` metafield (one per variant, read by the
 * Cart Transform function), this is one JSON object per **shop**, keyed by
 * offer id, because a Mix & Match bundle spans many products and has no
 * single product page of its own to attach a display metafield to.
 *
 * Purely a rendering cache: the Theme App Extension never sends any of
 * this back to the cart, so it carries no security weight — see
 * docs/SECURITY.md "Cart security".
 */

export interface MixMatchDisplayProduct {
  variantId: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
}

export interface MixMatchDisplayTier {
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  label: string | null;
}

export interface MixMatchDisplayEntry {
  offerId: string;
  publicTitle: string;
  description: string | null;
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  tiers: MixMatchDisplayTier[];
  products: MixMatchDisplayProduct[];
}

export interface MixMatchOfferForDisplay {
  id: string;
  publicTitle: string;
  description: string | null;
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  tiers: MixMatchDisplayTier[];
  variants: {
    shopifyVariantId: string;
    titleCache: string | null;
    imageCache: string | null;
    priceCache: number | null;
  }[];
}

export type MixMatchBundlesDisplay = Record<string, MixMatchDisplayEntry>;

export function buildMixMatchBundlesDisplay(
  activeOffers: MixMatchOfferForDisplay[],
): MixMatchBundlesDisplay {
  const display: MixMatchBundlesDisplay = {};

  for (const offer of activeOffers) {
    display[offer.id] = {
      offerId: offer.id,
      publicTitle: offer.publicTitle,
      description: offer.description,
      minItems: offer.minItems,
      maxItems: offer.maxItems,
      allowDuplicates: offer.allowDuplicates,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      tiers: offer.tiers,
      products: offer.variants.map((v) => ({
        variantId: v.shopifyVariantId,
        title: v.titleCache ?? v.shopifyVariantId,
        imageUrl: v.imageCache,
        price: v.priceCache,
      })),
    };
  }

  return display;
}
