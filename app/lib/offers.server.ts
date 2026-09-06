import db from "../db.server";
import { assertCanActivateOffer } from "./entitlements.server";
import {
  validateQuantityBreakOffer,
  type QuantityBreakOfferInput,
} from "./validation/quantity-break";

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
    include: { tiers: { orderBy: { quantity: "asc" } }, products: true },
  });
}

/** Loads an offer, scoped to shopId — never expose another shop's offer. */
export async function getOwnedOffer(shopId: string, offerId: string) {
  const offer = await db.offer.findFirst({
    where: { id: offerId, shopId },
    include: { tiers: { orderBy: { quantity: "asc" } }, products: true },
  });
  if (!offer) {
    throw new OfferNotFoundError(`Offer ${offerId} not found for this shop.`);
  }
  return offer;
}

/**
 * Finds other *active* offers that already control one of the given
 * products, so the builder can warn before a merchant creates an ambiguous
 * overlap (brief item 36). V1 scope: product-level conflicts only — variant-
 * level scoping refines this in a later phase.
 */
export async function findConflictingActiveOffers(
  shopId: string,
  excludeOfferId: string | null,
  shopifyProductIds: string[],
) {
  if (shopifyProductIds.length === 0) return [];

  const conflicting = await db.offer.findMany({
    where: {
      shopId,
      status: "ACTIVE",
      id: excludeOfferId ? { not: excludeOfferId } : undefined,
      products: { some: { shopifyProductId: { in: shopifyProductIds } } },
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

  const conflicts = await findConflictingActiveOffers(
    shopId,
    offerId,
    offer.products.map((p) => p.shopifyProductId),
  );
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
