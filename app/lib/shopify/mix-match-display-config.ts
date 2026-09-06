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

export interface MixMatchDisplayGroup {
  id: string;
  name: string;
  description: string | null;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  allowDuplicates: boolean;
  products: MixMatchDisplayProduct[];
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
  /**
   * Present only for Grouped Mix & Match offers — the storefront widget
   * renders a step-by-step flow from this instead of the flat `products`
   * grid when it's set. See docs/THEME_EXTENSION.md "Mix & Match block".
   */
  groups?: MixMatchDisplayGroup[];
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

function toDisplayProducts(
  variants: { shopifyVariantId: string; titleCache: string | null; imageCache: string | null; priceCache: number | null }[],
): MixMatchDisplayProduct[] {
  return variants.map((v) => ({
    variantId: v.shopifyVariantId,
    title: v.titleCache ?? v.shopifyVariantId,
    imageUrl: v.imageCache,
    price: v.priceCache,
  }));
}

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
      products: toDisplayProducts(offer.variants),
    };
  }

  return display;
}

export interface MixMatchGroupedGroupForDisplay {
  id: string;
  name: string;
  description: string | null;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  allowDuplicates: boolean;
  variants: {
    shopifyVariantId: string;
    titleCache: string | null;
    imageCache: string | null;
    priceCache: number | null;
  }[];
}

export interface MixMatchGroupedOfferForDisplay {
  id: string;
  publicTitle: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  tiers: MixMatchDisplayTier[];
  groups: MixMatchGroupedGroupForDisplay[];
}

/**
 * Grouped counterpart of `buildMixMatchBundlesDisplay` — same map shape
 * (keyed by offer id) so the two can be merged into one
 * `mix-match-bundles` metafield value, but each entry carries `groups`
 * instead of a flat `products` pool. `minItems`/`maxItems` are derived
 * from the groups purely for display (e.g. an overall "2-4 items" label);
 * `allowDuplicates` is unused at this level since each group sets its own.
 */
export function buildGroupedMixMatchBundlesDisplay(
  activeOffers: MixMatchGroupedOfferForDisplay[],
): MixMatchBundlesDisplay {
  const display: MixMatchBundlesDisplay = {};

  for (const offer of activeOffers) {
    const minItems = offer.groups.reduce(
      (sum, g) => sum + (g.required ? g.minSelections : 0),
      0,
    );
    const maxItems = offer.groups.reduce((sum, g) => sum + g.maxSelections, 0);

    display[offer.id] = {
      offerId: offer.id,
      publicTitle: offer.publicTitle,
      description: offer.description,
      minItems,
      maxItems,
      allowDuplicates: false,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      tiers: offer.tiers,
      products: [],
      groups: offer.groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections,
        required: g.required,
        allowDuplicates: g.allowDuplicates,
        products: toDisplayProducts(g.variants),
      })),
    };
  }

  return display;
}
