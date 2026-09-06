import db from "../db.server";
import { assertCanActivateOffer } from "./entitlements.server";
import {
  validateQuantityBreakOffer,
  type QuantityBreakOfferInput,
} from "./validation/quantity-break";
import {
  validateMixMatchOffer,
  type MixMatchOfferInput,
} from "./validation/mix-match";

export class OfferNotFoundError extends Error {}
export class OfferValidationError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors.join(" "));
    this.errors = errors;
  }
}
export class OfferConflictError extends Error {
  conflicts: { offerId: string; name: string }[];
  constructor(conflicts: { offerId: string; name: string }[]) {
    super(
      "This variant is already used by another active BundlePilot offer.",
    );
    this.conflicts = conflicts;
  }
}

export async function listOffers(shopId: string) {
  return db.offer.findMany({
    where: { shopId },
    orderBy: { updatedAt: "desc" },
    include: {
      tiers: { orderBy: { quantity: "asc" } },
      products: true,
      variants: true,
    },
  });
}

/** Loads an offer, scoped to shopId — never expose another shop's offer. */
export async function getOwnedOffer(shopId: string, offerId: string) {
  const offer = await db.offer.findFirst({
    where: { id: offerId, shopId },
    include: {
      tiers: { orderBy: { quantity: "asc" } },
      products: true,
      variants: true,
    },
  });
  if (!offer) {
    throw new OfferNotFoundError(`Offer ${offerId} not found for this shop.`);
  }
  return offer;
}

/**
 * Finds other *active* offers that already control one of the given
 * products or variants, so the builder can warn before a merchant creates
 * an ambiguous overlap (brief item 36). Quantity Break scopes by product;
 * Mix & Match scopes by variant — an offer conflicts if it shares either.
 */
export async function findConflictingActiveOffers(
  shopId: string,
  excludeOfferId: string | null,
  scope: { shopifyProductIds?: string[]; shopifyVariantIds?: string[] },
) {
  const shopifyProductIds = scope.shopifyProductIds ?? [];
  const shopifyVariantIds = scope.shopifyVariantIds ?? [];
  if (shopifyProductIds.length === 0 && shopifyVariantIds.length === 0) return [];

  const conflicting = await db.offer.findMany({
    where: {
      shopId,
      status: "ACTIVE",
      id: excludeOfferId ? { not: excludeOfferId } : undefined,
      OR: [
        ...(shopifyProductIds.length > 0
          ? [{ products: { some: { shopifyProductId: { in: shopifyProductIds } } } }]
          : []),
        ...(shopifyVariantIds.length > 0
          ? [{ variants: { some: { shopifyVariantId: { in: shopifyVariantIds } } } }]
          : []),
      ],
    },
    select: { id: true, name: true },
  });

  return conflicting.map((o) => ({ offerId: o.id, name: o.name }));
}

function toQuantityBreakValidationInput(
  data: QuantityBreakOfferData,
): QuantityBreakOfferInput {
  return {
    name: data.name,
    publicTitle: data.publicTitle,
    productIds: data.products.map((p) => p.shopifyProductId),
    tiers: data.tiers,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
  };
}

export interface QuantityBreakOfferData {
  name: string;
  publicTitle: string;
  description?: string | null;
  products: { shopifyProductId: string; titleCache?: string | null; imageCache?: string | null }[];
  tiers: { quantity: number; discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountValue: number; label?: string | null }[];
  startsAt?: Date | null;
  endsAt?: Date | null;
}

async function upsertProductsAndTiers(offerId: string, data: QuantityBreakOfferData) {
  await db.offerProduct.deleteMany({ where: { offerId } });
  await db.offerTier.deleteMany({ where: { offerId } });

  if (data.products.length > 0) {
    await db.offerProduct.createMany({
      data: data.products.map((p) => ({
        offerId,
        shopifyProductId: p.shopifyProductId,
        titleCache: p.titleCache ?? null,
        imageCache: p.imageCache ?? null,
      })),
    });
  }
  if (data.tiers.length > 0) {
    await db.offerTier.createMany({
      data: data.tiers.map((t) => ({
        offerId,
        quantity: t.quantity,
        discountType: t.discountType,
        discountValue: t.discountValue,
        label: t.label ?? null,
      })),
    });
  }
}

export async function createQuantityBreakDraft(
  shopId: string,
  data: QuantityBreakOfferData,
) {
  const validation = validateQuantityBreakOffer(toQuantityBreakValidationInput(data));
  if (!validation.valid) {
    throw new OfferValidationError(validation.errors);
  }

  const offer = await db.offer.create({
    data: {
      shopId,
      type: "QUANTITY_BREAK",
      status: "DRAFT",
      name: data.name,
      publicTitle: data.publicTitle,
      description: data.description ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
    },
  });

  await upsertProductsAndTiers(offer.id, data);

  return getOwnedOffer(shopId, offer.id);
}

export async function updateQuantityBreakOffer(
  shopId: string,
  offerId: string,
  data: QuantityBreakOfferData,
) {
  await getOwnedOffer(shopId, offerId); // 404s if not owned

  const validation = validateQuantityBreakOffer(toQuantityBreakValidationInput(data));
  if (!validation.valid) {
    throw new OfferValidationError(validation.errors);
  }

  await db.offer.update({
    where: { id: offerId },
    data: {
      name: data.name,
      publicTitle: data.publicTitle,
      description: data.description ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
    },
  });

  await upsertProductsAndTiers(offerId, data);

  return getOwnedOffer(shopId, offerId);
}

export interface MixMatchOfferData {
  name: string;
  publicTitle: string;
  description?: string | null;
  variants: {
    shopifyVariantId: string;
    titleCache?: string | null;
    imageCache?: string | null;
    priceCache?: number | null;
  }[];
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null; // null when using tiers
  discountValue: number | null;
  tiers: { quantity: number; discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountValue: number; label?: string | null }[];
  startsAt?: Date | null;
  endsAt?: Date | null;
}

function toMixMatchValidationInput(data: MixMatchOfferData): MixMatchOfferInput {
  return {
    name: data.name,
    publicTitle: data.publicTitle,
    variantIds: data.variants.map((v) => v.shopifyVariantId),
    minItems: data.minItems,
    maxItems: data.maxItems,
    allowDuplicates: data.allowDuplicates,
    discountType: data.discountType,
    discountValue: data.discountValue,
    tiers: data.tiers,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
  };
}

// Flat pool only (bundleGroupId: null) — Grouped Mix & Match (Phase 4) adds
// per-group variants separately without touching this flat-pool slice.
async function upsertMixMatchPoolAndTiers(offerId: string, data: MixMatchOfferData) {
  await db.offerVariant.deleteMany({ where: { offerId, bundleGroupId: null } });
  await db.offerTier.deleteMany({ where: { offerId } });

  if (data.variants.length > 0) {
    await db.offerVariant.createMany({
      data: data.variants.map((v) => ({
        offerId,
        shopifyVariantId: v.shopifyVariantId,
        titleCache: v.titleCache ?? null,
        imageCache: v.imageCache ?? null,
        priceCache: v.priceCache ?? null,
      })),
    });
  }
  if (data.tiers.length > 0) {
    await db.offerTier.createMany({
      data: data.tiers.map((t) => ({
        offerId,
        quantity: t.quantity,
        discountType: t.discountType,
        discountValue: t.discountValue,
        label: t.label ?? null,
      })),
    });
  }
}

export async function createMixMatchDraft(shopId: string, data: MixMatchOfferData) {
  const validation = validateMixMatchOffer(toMixMatchValidationInput(data));
  if (!validation.valid) {
    throw new OfferValidationError(validation.errors);
  }

  const offer = await db.offer.create({
    data: {
      shopId,
      type: "MIX_MATCH",
      status: "DRAFT",
      name: data.name,
      publicTitle: data.publicTitle,
      description: data.description ?? null,
      minItems: data.minItems,
      maxItems: data.maxItems,
      allowDuplicates: data.allowDuplicates,
      discountType: data.discountType,
      discountValue: data.discountValue,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
    },
  });

  await upsertMixMatchPoolAndTiers(offer.id, data);

  return getOwnedOffer(shopId, offer.id);
}

/**
 * `configVersion` is bumped on every edit — the Cart Transform function
 * uses it to detect a cart line still carrying a stale denormalized
 * snapshot while the new one is propagating to variant metafields. See
 * docs/MIX_MATCH_ENGINE.md.
 */
export async function updateMixMatchOffer(
  shopId: string,
  offerId: string,
  data: MixMatchOfferData,
) {
  await getOwnedOffer(shopId, offerId); // 404s if not owned

  const validation = validateMixMatchOffer(toMixMatchValidationInput(data));
  if (!validation.valid) {
    throw new OfferValidationError(validation.errors);
  }

  await db.offer.update({
    where: { id: offerId },
    data: {
      name: data.name,
      publicTitle: data.publicTitle,
      description: data.description ?? null,
      minItems: data.minItems,
      maxItems: data.maxItems,
      allowDuplicates: data.allowDuplicates,
      discountType: data.discountType,
      discountValue: data.discountValue,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      configVersion: { increment: 1 },
    },
  });

  await upsertMixMatchPoolAndTiers(offerId, data);

  return getOwnedOffer(shopId, offerId);
}

export async function deleteOffer(shopId: string, offerId: string) {
  await getOwnedOffer(shopId, offerId); // 404s if not owned
  await db.offer.delete({ where: { id: offerId } });
}

/**
 * Validates plan entitlements + conflicts before flipping an offer ACTIVE.
 * Does NOT talk to Shopify — see app/lib/shopify/quantity-break-sync.server.ts
 * for the discount/metafield sync that must follow a successful activation.
 */
export async function activateOffer(shopId: string, offerId: string) {
  const offer = await getOwnedOffer(shopId, offerId);

  if (offer.status !== "ACTIVE") {
    await assertCanActivateOffer(shopId);
  }

  const conflicts = await findConflictingActiveOffers(shopId, offerId, {
    shopifyProductIds: offer.products.map((p) => p.shopifyProductId),
    shopifyVariantIds: offer.variants.map((v) => v.shopifyVariantId),
  });
  if (conflicts.length > 0) {
    throw new OfferConflictError(conflicts);
  }

  return db.offer.update({
    where: { id: offerId },
    data: { status: "ACTIVE" },
  });
}

export async function pauseOffer(shopId: string, offerId: string) {
  await getOwnedOffer(shopId, offerId);
  return db.offer.update({ where: { id: offerId }, data: { status: "PAUSED" } });
}
