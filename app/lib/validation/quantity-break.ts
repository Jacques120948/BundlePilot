/**
 * Pure, server-side validation for a Quantity Break offer. No Prisma/Shopify
 * calls here so this stays trivially unit-testable — see
 * docs/BUNDLE_ARCHITECTURE.md "Admin validation" for why this must run on
 * the server (client-side validation is UX only, never the source of truth).
 */

export interface QuantityBreakTierInput {
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  label?: string | null;
}

export interface QuantityBreakOfferInput {
  name: string;
  publicTitle: string;
  productIds: string[]; // Shopify Product GIDs
  tiers: QuantityBreakTierInput[];
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateQuantityBreakOffer(
  input: QuantityBreakOfferInput,
): ValidationResult {
  const errors: string[] = [];

  if (!input.name.trim()) {
    errors.push("Offer name is required.");
  }
  if (!input.publicTitle.trim()) {
    errors.push("Customer-facing title is required.");
  }
  if (input.productIds.length === 0) {
    errors.push("Select at least one product.");
  }

  if (input.tiers.length === 0) {
    errors.push("Add at least one quantity tier.");
  }

  const seenQuantities = new Set<number>();
  for (const tier of input.tiers) {
    if (!Number.isInteger(tier.quantity) || tier.quantity <= 0) {
      errors.push(`Tier quantity must be a positive whole number (got ${tier.quantity}).`);
      continue;
    }
    if (seenQuantities.has(tier.quantity)) {
      errors.push(`Duplicate tier for quantity ${tier.quantity}.`);
    }
    seenQuantities.add(tier.quantity);

    if (tier.discountValue < 0) {
      errors.push(`Discount for quantity ${tier.quantity} can't be negative.`);
    }
    if (tier.discountType === "PERCENTAGE" && tier.discountValue > 100) {
      errors.push(`Percentage discount for quantity ${tier.quantity} can't exceed 100%.`);
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
