/**
 * HAND-WRITTEN placeholder for the types `shopify app function typegen`
 * would normally generate. See ../schema.graphql for why — same situation
 * as extensions/quantity-break-discount/generated/api.ts. Replace this
 * file by running `npm run typegen` from this extension's directory once
 * the app is linked to a Partner org.
 */

interface ProductVariantMerchandise {
  __typename: "ProductVariant";
  id: string;
  bundleComponent: { jsonValue: unknown } | null;
}

interface CustomProductMerchandise {
  __typename: "CustomProduct";
}

export interface CartLine {
  id: string;
  quantity: number;
  cost: { amountPerQuantity: { amount: string } };
  merchandise: ProductVariantMerchandise | CustomProductMerchandise;
  offerAttr: { value: string | null } | null;
  sessionAttr: { value: string | null } | null;
}

export interface CartTransformRunInput {
  cart: {
    lines: CartLine[];
  };
}

export interface CartLineInput {
  cartLineId: string;
  quantity: number;
}

export interface LinesMergeOperation {
  cartLines: CartLineInput[];
  parentVariantId: string;
  title?: string;
  price?: { percentageDecrease: { value: number } };
}

export type CartOperation = {
  linesMerge: LinesMergeOperation;
};

export interface CartTransformRunResult {
  operations: CartOperation[];
}
