import { describe, expect, it } from "vitest";
import {
  OFFER_TYPES,
  OFFER_TYPE_LABELS,
  OFFER_TYPE_ENFORCEMENT,
} from "./offer-types";

describe("offer-types", () => {
  it("has a label for every offer type", () => {
    for (const type of OFFER_TYPES) {
      expect(OFFER_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("enforces MIX_MATCH and MIX_MATCH_GROUPED via cart transform, not discount function", () => {
    expect(OFFER_TYPE_ENFORCEMENT.QUANTITY_BREAK).toBe("discount-function");
    expect(OFFER_TYPE_ENFORCEMENT.MIX_MATCH).toBe("cart-transform-function");
    expect(OFFER_TYPE_ENFORCEMENT.MIX_MATCH_GROUPED).toBe(
      "cart-transform-function",
    );
  });
});
