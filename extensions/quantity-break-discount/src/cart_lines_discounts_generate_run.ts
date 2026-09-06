import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  type CartLinesDiscountsGenerateRunInput,
  type CartLinesDiscountsGenerateRunResult,
  type CartOperation,
} from "../generated/api";

/**
 * Must match app/lib/shopify/quantity-break-config.ts#FunctionConfiguration
 * exactly — this is the enforcement config written to the discount's own
 * `$app:function-configuration` metafield by
 * app/lib/shopify/quantity-break-sync.server.ts. See docs/DISCOUNT_ENGINE.md.
 *
 * V1 scope is product-level (`productIds`), not variant-level — the
 * `OfferVariant` table already models a future variant-level restriction,
 * but the Phase 1 builder UI doesn't expose it yet.
 */
interface FunctionConfigurationTier {
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
}

interface FunctionConfiguration {
  version: 1;
  productIds: string[];
  tiers: FunctionConfigurationTier[];
}

function isFunctionConfiguration(value: unknown): value is FunctionConfiguration {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<FunctionConfiguration>;
  return (
    config.version === 1 &&
    Array.isArray(config.productIds) &&
    Array.isArray(config.tiers)
  );
}

/** The highest tier whose quantity threshold `quantity` meets. Tiers never stack. */
function selectTier(
  tiers: FunctionConfigurationTier[],
  quantity: number,
): FunctionConfigurationTier | undefined {
  let best: FunctionConfigurationTier | undefined;
  for (const tier of tiers) {
    if (quantity >= tier.quantity && (!best || tier.quantity > best.quantity)) {
      best = tier;
    }
  }
  return best;
}

export function cartLinesDiscountsGenerateRun(
  input: CartLinesDiscountsGenerateRunInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );
  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  // Fail closed: no (or malformed) configuration on the discount's own
  // metafield means no discount, regardless of anything else in the cart or
  // request. See docs/SECURITY.md "Cart security".
  const rawConfig = input.discount.metafield?.jsonValue;
  if (!isFunctionConfiguration(rawConfig)) {
    return { operations: [] };
  }
  const config = rawConfig;
  const configuredProductIds = new Set(config.productIds);

  const candidates: CartOperation["productDiscountsAdd"]["candidates"] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;
    if (!configuredProductIds.has(line.merchandise.product.id)) continue;

    const tier = selectTier(config.tiers, line.quantity);
    if (!tier || tier.discountValue <= 0) continue;

    candidates.push({
      message:
        tier.discountType === "PERCENTAGE"
          ? `${tier.discountValue}% OFF`
          : `${tier.discountValue} OFF`,
      targets: [{ cartLine: { id: line.id } }],
      value:
        tier.discountType === "PERCENTAGE"
          ? { percentage: { value: tier.discountValue } }
          : { fixedAmount: { amount: tier.discountValue } },
    });
  }

  if (candidates.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
