/**
 * HAND-WRITTEN placeholder for the types `shopify app function typegen`
 * would normally generate from `schema.graphql` + `src/*.graphql`.
 *
 * This sandbox has no Shopify Partner org linked, so `shopify app function
 * typegen` (which needs an authenticated CLI session) couldn't be run here.
 * These shapes were instead hand-verified against the Discount API schema
 * for the `cart.lines.discounts.generate.run` target (see ../schema.graphql
 * and docs/DISCOUNT_ENGINE.md "Verification status").
 *
 * DELETE this file and run `npm run typegen` (from this extension's
 * directory, once the app is linked to a Partner org) to replace it with
 * the real generated types — do not hand-maintain this long-term.
 */

export enum DiscountClass {
  Order = "ORDER",
  Product = "PRODUCT",
  Shipping = "SHIPPING",
}

export enum ProductDiscountSelectionStrategy {
  All = "ALL",
  First = "FIRST",
  Maximum = "MAXIMUM",
}

interface ProductVariantMerchandise {
  __typename: "ProductVariant";
  id: string;
  product: { id: string };
}

interface CustomProductMerchandise {
  __typename: "CustomProduct";
}

export interface CartLine {
  id: string;
  quantity: number;
  merchandise: ProductVariantMerchandise | CustomProductMerchandise;
}

export interface CartLinesDiscountsGenerateRunInput {
  cart: {
    lines: CartLine[];
  };
  discount: {
    discountClasses: DiscountClass[];
    metafield: { jsonValue: unknown } | null;
  };
}

export interface CartLineTarget {
  id: string;
  quantity?: number | null;
}

export interface ProductDiscountCandidateTarget {
  cartLine: CartLineTarget;
}

export type ProductDiscountCandidateValue =
  | { percentage: { value: number }; fixedAmount?: never }
  | { fixedAmount: { amount: number; considerAllLines?: boolean }; percentage?: never };

export interface ProductDiscountCandidate {
  message?: string;
  targets: ProductDiscountCandidateTarget[];
  value: ProductDiscountCandidateValue;
}

export interface ProductDiscountsAddOperation {
  candidates: ProductDiscountCandidate[];
  selectionStrategy: ProductDiscountSelectionStrategy;
}

export type CartOperation = {
  productDiscountsAdd: ProductDiscountsAddOperation;
};

export interface CartLinesDiscountsGenerateRunResult {
  operations: CartOperation[];
}
