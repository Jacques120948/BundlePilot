import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import { METAFIELD_NAMESPACE_APP, METAFIELD_KEYS } from "./metafields";
import { buildBundleComponentConfig, type MixMatchOfferForConfig } from "./mix-match-config";

interface UserError {
  field: string[];
  message: string;
}

function assertNoErrors(errors: UserError[] | undefined, action: string): void {
  if (errors && errors.length > 0) {
    throw new Error(`Failed to ${action}: ${JSON.stringify(errors)}`);
  }
}

/**
 * Looks up this app's deployed Mix & Match Cart Transform function by
 * title, the same pattern as
 * app/lib/shopify/quantity-break-sync.server.ts#getQuantityBreakFunctionId.
 * NOT independently verified against a live store in this environment —
 * see docs/CART_TRANSFORM.md "Verification status".
 */
export async function getMixMatchFunctionId(admin: AdminGraphqlClient): Promise<string> {
  const response = await admin(
    `#graphql
      query MixMatchFunctionId {
        shopifyFunctions(apiType: "cart_transform", first: 25) {
          nodes { id title apiType }
        }
      }`,
  );
  const json = (await response.json()) as {
    data?: { shopifyFunctions?: { nodes: { id: string; title: string }[] } };
  };
  const match = json.data?.shopifyFunctions?.nodes.find(
    (fn) => fn.title === "BundlePilot: Mix & Match",
  );
  if (!match) {
    throw new Error(
      "Could not find the BundlePilot Mix & Match cart transform function for this app. " +
        "Has `shopify app deploy` been run for this Partner app?",
    );
  }
  return match.id;
}

/**
 * Registers the shop's single Cart Transform function if it isn't already
 * active. Idempotent: safe to call on every Mix & Match publish. Shopify
 * allows at most one cart transform per app per store, shared by every
 * Mix & Match / Grouped Mix & Match offer — see docs/CART_TRANSFORM.md
 * "Activation lifecycle".
 */
export async function ensureCartTransformActive(
  admin: AdminGraphqlClient,
  existingCartTransformId: string | null,
): Promise<string> {
  if (existingCartTransformId) return existingCartTransformId;

  const functionId = await getMixMatchFunctionId(admin);
  const response = await admin(
    `#graphql
      mutation EnsureCartTransform($functionId: String!) {
        cartTransformCreate(functionId: $functionId) {
          cartTransform { id }
          userErrors { field message }
        }
      }`,
    { variables: { functionId } },
  );
  const json = (await response.json()) as {
    data?: {
      cartTransformCreate?: { cartTransform?: { id: string }; userErrors: UserError[] };
    };
  };
  const result = json.data?.cartTransformCreate;
  assertNoErrors(result?.userErrors, "register the Mix & Match cart transform");
  if (!result?.cartTransform) {
    throw new Error("cartTransformCreate returned no cartTransform.");
  }
  return result.cartTransform.id;
}

/**
 * Creates (once) the hidden parent product + variant that every `linesMerge`
 * for this offer points to as `parentVariantId` — see
 * docs/BUNDLE_PRODUCT_MODEL.md. Never published to any sales channel. The
 * price is nominal ("more than 0" per Shopify's own bundle-parent
 * requirement) and never charged to a customer: the Cart Transform
 * operation's price adjustment always overrides it.
 */
export async function ensureMixMatchParentVariant(
  admin: AdminGraphqlClient,
  offer: { id: string; publicTitle: string; shopifyParentVariantId: string | null },
): Promise<{ productId: string; variantId: string }> {
  if (offer.shopifyParentVariantId) {
    // Keep the hidden product's title in sync so it's recognizable if a
    // merchant ever inspects it in Admin (e.g. via order line drill-down).
    await admin(
      `#graphql
        mutation RenameMixMatchParent($id: ID!, $title: String!) {
          productUpdate(product: { id: $id, title: $title }) {
            userErrors { field message }
          }
        }`,
      { variables: { id: offer.shopifyParentVariantId, title: offer.publicTitle } },
    );
    return {
      productId: offer.shopifyParentVariantId,
      variantId: offer.shopifyParentVariantId,
    };
  }

  const createResponse = await admin(
    `#graphql
      mutation CreateMixMatchParent($product: ProductInput!) {
        productCreate(product: $product) {
          product {
            id
            variants(first: 1) { edges { node { id } } }
          }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        product: {
          title: `BundlePilot bundle — ${offer.publicTitle}`,
          status: "DRAFT", // never published to any sales channel
        },
      },
    },
  );
  const createJson = (await createResponse.json()) as {
    data?: {
      productCreate?: {
        product?: { id: string; variants: { edges: { node: { id: string } }[] } };
        userErrors: UserError[];
      };
    };
  };
  const createResult = createJson.data?.productCreate;
  assertNoErrors(createResult?.userErrors, "create the Mix & Match bundle parent product");
  const product = createResult?.product;
  const variantId = product?.variants.edges[0]?.node.id;
  if (!product || !variantId) {
    throw new Error("productCreate returned no product/variant for the bundle parent.");
  }

  // Nominal, never-charged price — see docs/BUNDLE_PRODUCT_MODEL.md.
  const priceResponse = await admin(
    `#graphql
      mutation SetMixMatchParentPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
    { variables: { productId: product.id, variants: [{ id: variantId, price: "1.00" }] } },
  );
  const priceJson = (await priceResponse.json()) as {
    data?: { productVariantsBulkUpdate?: { userErrors: UserError[] } };
  };
  assertNoErrors(
    priceJson.data?.productVariantsBulkUpdate?.userErrors,
    "set the Mix & Match bundle parent's price",
  );

  return { productId: product.id, variantId };
}

/**
 * Writes the denormalized `bundle-component` metafield to every variant
 * currently in the offer's pool, and clears it from any variant that was
 * in a *previous* version of the pool but has since been removed (else a
 * dropped variant would keep believing it's still part of the bundle
 * forever). See docs/MIX_MATCH_ENGINE.md.
 */
export async function syncMixMatchVariantMetafields(
  admin: AdminGraphqlClient,
  offer: MixMatchOfferForConfig,
  previousVariantIds: string[],
  active: boolean,
): Promise<void> {
  const config = buildBundleComponentConfig(offer, active);
  const value = JSON.stringify(config);

  if (offer.variantIds.length > 0) {
    const setResponse = await admin(
      `#graphql
        mutation SyncBundleComponentMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
      {
        variables: {
          metafields: offer.variantIds.map((variantId) => ({
            ownerId: variantId,
            namespace: METAFIELD_NAMESPACE_APP,
            key: METAFIELD_KEYS.bundleComponent,
            type: "json",
            value,
          })),
        },
      },
    );
    const setJson = (await setResponse.json()) as {
      data?: { metafieldsSet?: { userErrors: UserError[] } };
    };
    assertNoErrors(setJson.data?.metafieldsSet?.userErrors, "write bundle-component metafields");
  }

  const removedVariantIds = previousVariantIds.filter((id) => !offer.variantIds.includes(id));
  if (removedVariantIds.length > 0) {
    const deleteResponse = await admin(
      `#graphql
        mutation ClearBundleComponentMetafields($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
      {
        variables: {
          metafields: removedVariantIds.map((variantId) => ({
            ownerId: variantId,
            namespace: METAFIELD_NAMESPACE_APP,
            key: METAFIELD_KEYS.bundleComponent,
          })),
        },
      },
    );
    const deleteJson = (await deleteResponse.json()) as {
      data?: { metafieldsDelete?: { userErrors: UserError[] } };
    };
    assertNoErrors(
      deleteJson.data?.metafieldsDelete?.userErrors,
      "clear bundle-component metafields from removed variants",
    );
  }
}
