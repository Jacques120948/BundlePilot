import type {
  CartLine,
  CartOperation,
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

/**
 * Must match app/lib/shopify/mix-match-config.ts#BundleComponentConfig
 * exactly — this is the denormalized config written to every pool
 * variant's `$app/bundle-component` metafield by
 * app/lib/shopify/mix-match-sync.server.ts. See docs/MIX_MATCH_ENGINE.md.
 */
interface BundleGroup {
  id: string;
  min: number;
  max: number;
  required: boolean;
  allowDuplicates: boolean;
  variantIds: string[];
}

interface BundleComponentConfig {
  version: 1;
  offerId: string;
  offerVersion: number;
  active: boolean;
  parentVariantId: string;
  publicTitle: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
  tiers: { quantity: number; discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountValue: number }[];
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  groups: BundleGroup[];
}

function isBundleComponentConfig(value: unknown): value is BundleComponentConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<BundleComponentConfig>;
  return (
    c.version === 1 &&
    typeof c.offerId === "string" &&
    typeof c.parentVariantId === "string" &&
    Array.isArray(c.groups)
  );
}

interface Candidate {
  line: CartLine;
  variantId: string;
  config: BundleComponentConfig;
}

/**
 * Groups by the `(offer, session)` attribute pair the storefront widget
 * sets. Only lines whose OWN variant metafield confirms the claimed offer
 * ID make it into a group — this is the tamper check. See
 * docs/SECURITY.md "Cart security".
 */
function collectCandidateGroups(lines: CartLine[]): Map<string, Candidate[]> {
  const groups = new Map<string, Candidate[]>();

  for (const line of lines) {
    const offerId = line.offerAttr?.value;
    const sessionId = line.sessionAttr?.value;
    if (!offerId || !sessionId) continue;
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const rawConfig = line.merchandise.bundleComponent?.jsonValue;
    if (!isBundleComponentConfig(rawConfig)) continue;
    if (rawConfig.offerId !== offerId) continue; // tamper check
    if (!rawConfig.active) continue;

    const key = `${offerId}|${sessionId}`;
    const list = groups.get(key) ?? [];
    list.push({ line, variantId: line.merchandise.id, config: rawConfig });
    groups.set(key, list);
  }

  return groups;
}

function selectTier(
  tiers: BundleComponentConfig["tiers"],
  itemCount: number,
): BundleComponentConfig["tiers"][number] | undefined {
  let best: BundleComponentConfig["tiers"][number] | undefined;
  for (const tier of tiers) {
    if (itemCount >= tier.quantity && (!best || tier.quantity > best.quantity)) {
      best = tier;
    }
  }
  return best;
}

/**
 * Resolves the discount to an equivalent percentage — the only
 * `linesMerge` price-adjustment field verified against current docs (see
 * docs/CART_TRANSFORM.md "Verification status"). `FIXED_AMOUNT` is
 * converted using the components' actual summed price so the dollar
 * discount matches exactly regardless of the conversion.
 */
function resolveEffectivePercentage(
  config: BundleComponentConfig,
  candidates: Candidate[],
): number | null {
  let discountType = config.discountType;
  let discountValue = config.discountValue;

  if (config.tiers.length > 0) {
    const itemCount = candidates.reduce((sum, c) => sum + c.line.quantity, 0);
    const tier = selectTier(config.tiers, itemCount);
    if (!tier) return null;
    discountType = tier.discountType;
    discountValue = tier.discountValue;
  }

  if (discountType === null || discountValue === null || discountValue <= 0) {
    return null;
  }
  if (discountType === "PERCENTAGE") {
    return Math.min(100, discountValue);
  }

  const componentsSum = candidates.reduce(
    (sum, c) => sum + Number(c.line.cost.amountPerQuantity.amount) * c.line.quantity,
    0,
  );
  if (componentsSum <= 0) return null;
  return Math.min(100, (discountValue / componentsSum) * 100);
}

/**
 * Each candidate is matched to the single group whose pool contains its
 * variant (admin-side validation keeps a variant from being placed in more
 * than one group — see docs/MIX_MATCH_ENGINE.md "Grouped bundles" — so an
 * ambiguous match here would only ever be an already-invalid config; the
 * first group wins defensively rather than the function throwing).
 */
function isGroupValid(candidates: Candidate[]): boolean {
  const config = candidates[0].config;

  // offerVersion consistency: if two lines claiming the same offer disagree
  // on the version, a merchant edit is still propagating — fail closed.
  if (!candidates.every((c) => c.config.offerVersion === config.offerVersion)) {
    return false;
  }

  const groupByVariant = new Map<string, BundleGroup>();
  for (const group of config.groups) {
    for (const variantId of group.variantIds) {
      if (!groupByVariant.has(variantId)) groupByVariant.set(variantId, group);
    }
  }

  const membership: { candidate: Candidate; group: BundleGroup }[] = [];
  for (const c of candidates) {
    const group = groupByVariant.get(c.variantId);
    if (!group) return false; // outside every group's pool
    membership.push({ candidate: c, group });
  }

  const totalItems = candidates.reduce((sum, c) => sum + c.line.quantity, 0);
  if (totalItems < config.minItems || totalItems > config.maxItems) return false;

  for (const group of config.groups) {
    const inGroup = membership.filter((m) => m.group.id === group.id);
    const groupItems = inGroup.reduce((sum, m) => sum + m.candidate.line.quantity, 0);

    // A required group must land inside its own range. An optional group
    // left untouched (0 items) is fine, but once the customer starts
    // filling it, it must still respect its own min/max — see
    // docs/MIX_MATCH_ENGINE.md "Grouped bundles".
    if (group.required || groupItems > 0) {
      if (groupItems < group.min || groupItems > group.max) return false;
    }

    if (!group.allowDuplicates) {
      const seenVariants = new Set<string>();
      for (const m of inGroup) {
        if (m.candidate.line.quantity > 1 || seenVariants.has(m.candidate.variantId)) return false;
        seenVariants.add(m.candidate.variantId);
      }
    }
  }

  return true;
}

export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  const groups = collectCandidateGroups(input.cart.lines);
  const operations: CartOperation[] = [];

  for (const candidates of groups.values()) {
    if (!isGroupValid(candidates)) continue;

    const percentage = resolveEffectivePercentage(candidates[0].config, candidates);
    if (percentage === null) continue;

    operations.push({
      linesMerge: {
        cartLines: candidates.map((c) => ({
          cartLineId: c.line.id,
          quantity: c.line.quantity,
        })),
        parentVariantId: candidates[0].config.parentVariantId,
        title: candidates[0].config.publicTitle,
        price: { percentageDecrease: { value: percentage } },
      },
    });
  }

  return { operations };
}
