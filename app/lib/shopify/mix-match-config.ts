/**
 * Builds the denormalized `bundle-component` JSON written to every variant
 * in a Mix & Match offer's pool — see docs/MIX_MATCH_ENGINE.md "The design
 * we use instead: denormalize onto component variants". Every variant in
 * the pool carries an identical copy of this object; the Cart Transform
 * function never needs to fetch anything beyond the metafields already on
 * the cart lines in front of it.
 *
 * Kept pure (no Prisma/GraphQL imports) so it's trivially unit-testable.
 */

export interface MixMatchTierData {
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
}

export interface MixMatchGroup {
  id: string;
  min: number;
  max: number;
  required: true;
  variantIds: string[];
}

export interface BundleComponentConfig {
  version: 1;
  offerId: string;
  offerVersion: number;
  /**
   * false when the offer is paused/archived. The Cart Transform function
   * must treat this exactly like a missing metafield (no discount) — see
   * "Pausing" in docs/CART_TRANSFORM.md and docs/MIX_MATCH_ENGINE.md.
   */
  active: boolean;
  /** The `linesMerge` `parentVariantId` — see docs/BUNDLE_PRODUCT_MODEL.md. */
  parentVariantId: string;
  publicTitle: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  tiers: MixMatchTierData[];
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  groups: MixMatchGroup[];
}

export interface MixMatchOfferForConfig {
  id: string;
  configVersion: number;
  parentVariantId: string;
  publicTitle: string;
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  tiers: MixMatchTierData[];
  variantIds: string[];
}

export function buildBundleComponentConfig(
  offer: MixMatchOfferForConfig,
  active: boolean,
): BundleComponentConfig {
  return {
    version: 1,
    offerId: offer.id,
    offerVersion: offer.configVersion,
    active,
    parentVariantId: offer.parentVariantId,
    publicTitle: offer.publicTitle,
    discountType: offer.discountType,
    discountValue: offer.discountValue,
    tiers: offer.tiers,
    minItems: offer.minItems,
    maxItems: offer.maxItems,
    allowDuplicates: offer.allowDuplicates,
    // Flat Mix & Match is a single unnamed group covering the whole pool —
    // Grouped Mix & Match (Phase 4) will emit one entry per BundleGroup
    // instead, each with its own min/max/variantIds.
    groups: [
      {
        id: "pool",
        min: offer.minItems,
        max: offer.maxItems,
        required: true,
        variantIds: offer.variantIds,
      },
    ],
  };
}
