import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import { METAFIELD_NAMESPACE_APP, METAFIELD_KEYS } from "./metafields";
import {
  buildDisplayConfiguration,
  buildFunctionConfiguration,
  type QuantityBreakTierData,
} from "./quantity-break-config";

/**
 * Looks up this app's deployed Quantity Break discount function by title.
 *
 * We resolve by title instead of hardcoding a function ID: the ID differs
 * per Partner app/environment, and `shopifyFunctions` is scoped to "owned by
 * the querying API client" so there's no risk of matching another app's
 * function. See extensions/quantity-break-discount/shopify.extension.toml
 * for the `name` this must match.
 *
 * NOT independently verified end-to-end against a live store in this
 * environment (no Partner org linked) — verify with `shopify app dev`
 * against a real dev store before relying on this in production. See
 * docs/DISCOUNT_ENGINE.md "Verification status".
 */
export async function getQuantityBreakFunctionId(
  admin: AdminGraphqlClient,
): Promise<string> {
  const response = await admin(
    `#graphql
      query QuantityBreakFunctionId {
        shopifyFunctions(apiType: "discount", first: 25) {
          nodes {
            id
            title
            apiType
          }
        }
      }`,
  );
  const json = (await response.json()) as {
    data?: {
      shopifyFunctions?: { nodes: { id: string; title: string; apiType: string }[] };
    };
  };

  const match = json.data?.shopifyFunctions?.nodes.find(
    (fn) => fn.title === "BundlePilot: Quantity Break",
  );

  if (!match) {
    throw new Error(
      "Could not find the BundlePilot Quantity Break discount function for this app. " +
        "Has `shopify app deploy` been run for this Partner app?",
    );
  }

  return match.id;
}

interface PublishQuantityBreakInput {
  offerId: string;
  publicTitle: string;
  shopifyDiscountId: string | null;
  productIds: string[];
  tiers: QuantityBreakTierData[];
  startsAt: Date | null;
  endsAt: Date | null;
  combinesWith: {
    orderDiscounts: boolean;
    productDiscounts: boolean;
    shippingDiscounts: boolean;
  };
}

/**
 * Creates or updates the `discountAutomaticApp` for a Quantity Break offer
 * and writes its function-configuration metafield. Returns the discount's
 * GID so the caller can persist it as `Offer.shopifyDiscountId`.
 */
export async function syncQuantityBreakDiscount(
  admin: AdminGraphqlClient,
  input: PublishQuantityBreakInput,
): Promise<string> {
  const functionConfiguration = buildFunctionConfiguration(
    input.productIds,
    input.tiers,
  );

  const metafields = [
    {
      namespace: METAFIELD_NAMESPACE_APP,
      key: METAFIELD_KEYS.quantityBreakFunctionConfiguration,
      type: "json",
      value: JSON.stringify(functionConfiguration),
    },
  ];

  if (input.shopifyDiscountId) {
    const response = await admin(
      `#graphql
        mutation QuantityBreakDiscountUpdate($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
          discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
            automaticAppDiscount { discountId }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          id: input.shopifyDiscountId,
          automaticAppDiscount: {
            title: input.publicTitle,
            startsAt: input.startsAt?.toISOString(),
            endsAt: input.endsAt?.toISOString() ?? null,
            combinesWith: input.combinesWith,
            metafields,
          },
        },
      },
    );
    const json = (await response.json()) as {
      data?: {
        discountAutomaticAppUpdate?: {
          automaticAppDiscount?: { discountId: string };
          userErrors: { field: string[]; message: string }[];
        };
      };
    };
    const result = json.data?.discountAutomaticAppUpdate;
    if (!result?.automaticAppDiscount || (result.userErrors?.length ?? 0) > 0) {
      throw new Error(
        `Failed to update Quantity Break discount: ${JSON.stringify(result?.userErrors)}`,
      );
    }
    return result.automaticAppDiscount.discountId;
  }

  const functionId = await getQuantityBreakFunctionId(admin);
  const response = await admin(
    `#graphql
      mutation QuantityBreakDiscountCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount { discountId }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        automaticAppDiscount: {
          title: input.publicTitle,
          functionId,
          startsAt: (input.startsAt ?? new Date()).toISOString(),
          endsAt: input.endsAt?.toISOString() ?? null,
          combinesWith: input.combinesWith,
          metafields,
        },
      },
    },
  );
  const json = (await response.json()) as {
    data?: {
      discountAutomaticAppCreate?: {
        automaticAppDiscount?: { discountId: string };
        userErrors: { field: string[]; message: string }[];
      };
    };
  };
  const result = json.data?.discountAutomaticAppCreate;
  if (!result?.automaticAppDiscount || (result.userErrors?.length ?? 0) > 0) {
    throw new Error(
      `Failed to create Quantity Break discount: ${JSON.stringify(result?.userErrors)}`,
    );
  }
  return result.automaticAppDiscount.discountId;
}

/**
 * Writes the storefront-readable display metafield (tiers + title) onto
 * every product covered by the offer, so the Theme App Extension block can
 * render it via `product.metafields.app.quantity-break-display` without any
 * app server round-trip. Never used for enforcement — see
 * docs/DISCOUNT_ENGINE.md.
 */
export async function syncQuantityBreakDisplayMetafields(
  admin: AdminGraphqlClient,
  offerId: string,
  publicTitle: string,
  productIds: string[],
  tiers: QuantityBreakTierData[],
): Promise<void> {
  if (productIds.length === 0) return;

  const displayConfiguration = buildDisplayConfiguration(offerId, publicTitle, tiers);
  const value = JSON.stringify(displayConfiguration);

  const response = await admin(
    `#graphql
      mutation QuantityBreakDisplayMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: productIds.map((productId) => ({
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE_APP,
          key: METAFIELD_KEYS.quantityBreakDisplay,
          type: "json",
          value,
        })),
      },
    },
  );
  const json = (await response.json()) as {
    data?: { metafieldsSet?: { userErrors: { field: string[]; message: string }[] } };
  };
  const errors = json.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Failed to write display metafields: ${JSON.stringify(errors)}`);
  }
}

/** Deactivates the discount without deleting it, so re-activating is instant. */
export async function pauseQuantityBreakDiscount(
  admin: AdminGraphqlClient,
  shopifyDiscountId: string,
): Promise<void> {
  const response = await admin(
    `#graphql
      mutation QuantityBreakDiscountDeactivate($id: ID!) {
        discountAutomaticDeactivate(id: $id) {
          userErrors { field message }
        }
      }`,
    { variables: { id: shopifyDiscountId } },
  );
  const json = (await response.json()) as {
    data?: { discountAutomaticDeactivate?: { userErrors: { field: string[]; message: string }[] } };
  };
  const errors = json.data?.discountAutomaticDeactivate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Failed to pause Quantity Break discount: ${JSON.stringify(errors)}`);
  }
}

/** Reactivates a previously paused discount, resetting `startsAt` to now. */
export async function resumeQuantityBreakDiscount(
  admin: AdminGraphqlClient,
  shopifyDiscountId: string,
): Promise<void> {
  const response = await admin(
    `#graphql
      mutation QuantityBreakDiscountActivate($id: ID!) {
        discountAutomaticActivate(id: $id) {
          userErrors { field message }
        }
      }`,
    { variables: { id: shopifyDiscountId } },
  );
  const json = (await response.json()) as {
    data?: { discountAutomaticActivate?: { userErrors: { field: string[]; message: string }[] } };
  };
  const errors = json.data?.discountAutomaticActivate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Failed to resume Quantity Break discount: ${JSON.stringify(errors)}`);
  }
}
