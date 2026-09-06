/**
 * Pure, server-side validation for a flat Mix & Match offer. See
 * docs/BUNDLE_ARCHITECTURE.md "Admin validation" — this is the server-side
 * gate that keeps a merchant from saving an offer the Cart Transform
 * function couldn't actually enforce (brief item 34's worked example:
 * "group requires 3, only 2 unique products available, duplicates
 * disallowed" must be rejected before publish, not discovered by a
 * confused customer at checkout).
 */

export interface MixMatchTierInput {
  quantity: number; // item count threshold, not a per-product quantity
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  label?: string | null;
}

export interface MixMatchOfferInput {
  name: string;
  publicTitle: string;
  variantIds: string[]; // Shopify ProductVariant GIDs in the pool
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null; // null when using tiers instead
  discountValue: number | null;
  tiers: MixMatchTierInput[];
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMixMatchOffer(input: MixMatchOfferInput): ValidationResult {
  const errors: string[] = [];

  if (!input.name.trim()) errors.push("Offer name is required.");
  if (!input.publicTitle.trim()) errors.push("Customer-facing title is required.");

  const uniqueVariantCount = new Set(input.variantIds).size;
  if (input.variantIds.length === 0) {
    errors.push("Add at least one product or variant to the pool.");
  }
  if (uniqueVariantCount !== input.variantIds.length) {
    errors.push("The same variant is selected more than once in the pool.");
  }

  if (!Number.isInteger(input.minItems) || input.minItems <= 0) {
    errors.push("Minimum selection must be a positive whole number.");
  }
  if (!Number.isInteger(input.maxItems) || input.maxItems <= 0) {
    errors.push("Maximum selection must be a positive whole number.");
  }
  if (
    Number.isInteger(input.minItems) &&
    Number.isInteger(input.maxItems) &&
    input.minItems > input.maxItems
  ) {
    errors.push("Minimum selection can't be greater than maximum selection.");
  }

  // The worked example from the brief: a bundle nobody could ever complete.
  if (
    !input.allowDuplicates &&
    Number.isInteger(input.maxItems) &&
    uniqueVariantCount < input.maxItems
  ) {
    errors.push(
      `This bundle requires up to ${input.maxItems} items, but only ${uniqueVariantCount} unique product(s) are available and duplicates aren't allowed.`,
    );
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
