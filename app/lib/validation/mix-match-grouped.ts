/**
 * Pure, server-side validation for a Grouped Mix & Match offer (Phase 4).
 * Extends the flat Mix & Match rules (docs/BUNDLE_ARCHITECTURE.md "Admin
 * validation") with per-group checks, so a merchant can't save a bundle the
 * Cart Transform function couldn't actually enforce — see
 * docs/MIX_MATCH_ENGINE.md "Grouped bundles".
 */

const MAX_GROUPS = 10; // docs/BUNDLE_LIMITATIONS.md
const MAX_TOTAL_VARIANTS = 150; // docs/BUNDLE_LIMITATIONS.md (shared cap with flat Mix & Match)

export interface MixMatchGroupedTierInput {
  quantity: number; // item count threshold, not a per-product quantity
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  label?: string | null;
}

export interface MixMatchGroupedGroupInput {
  name: string;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  allowDuplicates: boolean;
  variantIds: string[]; // Shopify ProductVariant GIDs in this group's pool
}

export interface MixMatchGroupedOfferInput {
  name: string;
  publicTitle: string;
  groups: MixMatchGroupedGroupInput[];
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null; // null when using tiers instead
  discountValue: number | null;
  tiers: MixMatchGroupedTierInput[];
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMixMatchGroupedOffer(input: MixMatchGroupedOfferInput): ValidationResult {
  const errors: string[] = [];

  if (!input.name.trim()) errors.push("Offer name is required.");
  if (!input.publicTitle.trim()) errors.push("Customer-facing title is required.");

  if (input.groups.length === 0) {
    errors.push("Add at least one group (e.g. \"Choose 1 candle\").");
  }
  if (input.groups.length > MAX_GROUPS) {
    errors.push(`A bundle can have at most ${MAX_GROUPS} groups.`);
  }

  const allVariantIds: string[] = [];
  const groupNames = new Set<string>();

  input.groups.forEach((group, index) => {
    const label = group.name.trim() || `Group ${index + 1}`;

    if (!group.name.trim()) {
      errors.push(`Group ${index + 1} needs a name.`);
    } else if (groupNames.has(group.name.trim())) {
      errors.push(`Group name "${group.name.trim()}" is used more than once.`);
    }
    groupNames.add(group.name.trim());

    if (!Number.isInteger(group.minSelections) || group.minSelections < 0) {
      errors.push(`${label}: minimum selection must be zero or a positive whole number.`);
    }
    if (!Number.isInteger(group.maxSelections) || group.maxSelections <= 0) {
      errors.push(`${label}: maximum selection must be a positive whole number.`);
    }
    if (
      Number.isInteger(group.minSelections) &&
      Number.isInteger(group.maxSelections) &&
      group.minSelections > group.maxSelections
    ) {
      errors.push(`${label}: minimum selection can't be greater than maximum selection.`);
    }
    if (group.required && group.minSelections === 0) {
      errors.push(`${label}: a required group needs a minimum of at least 1.`);
    }

    const uniqueVariantCount = new Set(group.variantIds).size;
    if (group.variantIds.length === 0) {
      errors.push(`${label}: add at least one product or variant.`);
    }
    if (uniqueVariantCount !== group.variantIds.length) {
      errors.push(`${label}: the same variant is selected more than once in this group.`);
    }
    if (
      !group.allowDuplicates &&
      Number.isInteger(group.maxSelections) &&
      uniqueVariantCount < group.maxSelections
    ) {
      errors.push(
        `${label} allows up to ${group.maxSelections} items, but only ${uniqueVariantCount} unique product(s) are available and duplicates aren't allowed.`,
      );
    }

    allVariantIds.push(...group.variantIds);
  });

  // A variant placed in two groups would make Cart Transform's per-line
  // group membership ambiguous — see docs/MIX_MATCH_ENGINE.md "Grouped
  // bundles" for why this is a deliberate V1 restriction, not an oversight.
  const seenAcrossGroups = new Set<string>();
  const duplicatedAcrossGroups = new Set<string>();
  for (const id of allVariantIds) {
    if (seenAcrossGroups.has(id)) duplicatedAcrossGroups.add(id);
    seenAcrossGroups.add(id);
  }
  if (duplicatedAcrossGroups.size > 0) {
    errors.push(
      "The same product or variant can't be placed in more than one group in this bundle.",
    );
  }

  if (allVariantIds.length > MAX_TOTAL_VARIANTS) {
    errors.push(`A bundle can reference at most ${MAX_TOTAL_VARIANTS} products/variants in total.`);
  }

  const hasFlatDiscount = input.discountType !== null;
  const hasTiers = input.tiers.length > 0;
  if (!hasFlatDiscount && !hasTiers) {
    errors.push("Set a discount, or add at least one tier.");
  }
  if (hasFlatDiscount && hasTiers) {
    errors.push("Use either a single discount or tiers, not both.");
  }

  if (hasFlatDiscount) {
    if (input.discountValue === null || input.discountValue < 0) {
      errors.push("Discount value can't be negative.");
    } else if (input.discountType === "PERCENTAGE" && input.discountValue > 100) {
      errors.push("Percentage discount can't exceed 100%.");
    }
  }

  const seenTierQuantities = new Set<number>();
  for (const tier of input.tiers) {
    if (!Number.isInteger(tier.quantity) || tier.quantity <= 0) {
      errors.push(`Tier item count must be a positive whole number (got ${tier.quantity}).`);
      continue;
    }
    if (seenTierQuantities.has(tier.quantity)) {
      errors.push(`Duplicate tier for ${tier.quantity} items.`);
    }
    seenTierQuantities.add(tier.quantity);

    if (tier.discountValue < 0) {
      errors.push(`Discount for ${tier.quantity} items can't be negative.`);
    }
    if (tier.discountType === "PERCENTAGE" && tier.discountValue > 100) {
      errors.push(`Percentage discount for ${tier.quantity} items can't exceed 100%.`);
    }
  }

  if (
    input.startsAt &&
    input.endsAt &&
    input.endsAt.getTime() <= input.startsAt.getTime()
  ) {
    errors.push("End date must be after the start date.");
  }

  return { valid: errors.length === 0, errors };
}
