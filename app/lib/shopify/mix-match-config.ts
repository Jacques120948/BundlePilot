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
  required: boolean;
  /**
   * Per-group duplicate rule (Phase 4). Grouped Mix & Match lets each group
   * set its own — e.g. "choose 2 candles, duplicates OK" alongside "choose
   * 1 bracelet, no duplicates" in the same bundle. A flat Mix & Match
   * offer's single "pool" group mirrors the offer-level `allowDuplicates`
   * field for backward compatibility.
   */
  allowDuplicates: boolean;
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
    // Flat Mix & Match is a single unnamed group covering the whole pool.
    // Grouped Mix & Match (below) emits one entry per BundleGroup instead,
    // each with its own min/max/allowDuplicates/variantIds.
    groups: [
      {
        id: "pool",
        min: offer.minItems,
        max: offer.maxItems,
        required: true,
        allowDuplicates: offer.allowDuplicates,
        variantIds: offer.variantIds,
      },
    ],
  };
}

export interface MixMatchGroupedGroupForConfig {
  id: string;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  allowDuplicates: boolean;
  variantIds: string[];
}

export interface MixMatchGroupedOfferForConfig {
  id: string;
  configVersion: number;
  parentVariantId: string;
  publicTitle: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  tiers: MixMatchTierData[];
  groups: MixMatchGroupedGroupForConfig[];
}

/**
 * A Grouped Mix & Match bundle has no offer-wide minItems/maxItems of its
 * own (`Offer.minItems`/`maxItems` are null for MIX_MATCH_GROUPED — see
 * prisma/schema.prisma) — the overall size range is derived from its
 * groups instead: the minimum is the sum of every *required* group's own
 * minimum (an optional group never forces a floor), and the maximum is the
 * sum of every group's own maximum (an optional group can still be filled
 * up to its max). See docs/MIX_MATCH_ENGINE.md "Grouped bundles".
 */
export function computeGroupedAggregateBounds(
  groups: { minSelections: number; maxSelections: number; required: boolean }[],
): { minItems: number; maxItems: number } {
  return {
    minItems: groups.reduce((sum, g) => sum + (g.required ? g.minSelections : 0), 0),
    maxItems: groups.reduce((sum, g) => sum + g.maxSelections, 0),
  };
}

export function buildGroupedBundleComponentConfig(
  offer: MixMatchGroupedOfferForConfig,
  active: boolean,
): BundleComponentConfig {
  const { minItems, maxItems } = computeGroupedAggregateBounds(offer.groups);
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
    minItems,
    maxItems,
    // Not meaningful at the offer level for grouped bundles — each group
    // carries its own `allowDuplicates` instead (see MixMatchGroup above).
    allowDuplicates: false,
    groups: offer.groups.map((g) => ({
      id: g.id,
      min: g.minSelections,
      max: g.maxSelections,
      required: g.required,
      allowDuplicates: g.allowDuplicates,
      variantIds: g.variantIds,
    })),
  };
}

/** Union of every variant id referenced by any group, for metafield sync. */
export function collectGroupedVariantIds(
  groups: { variantIds: string[] }[],
): string[] {
  return groups.flatMap((g) => g.variantIds);
}
