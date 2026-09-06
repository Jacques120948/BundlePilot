import type { LoaderFunctionArgs } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import { OFFER_TYPES, OFFER_TYPE_LABELS } from "../lib/offer-types";

export const loader = async (args: LoaderFunctionArgs) => {
  await requireTenant(args);
  return null;
};

const DESCRIPTIONS: Record<(typeof OFFER_TYPES)[number], string> = {
  QUANTITY_BREAK:
    "Discount a single product more as customers buy more of it (1 → 0%, 2 → 10%, 3 → 15% ...).",
  MIX_MATCH:
    "Let customers build their own bundle from a pool of products you choose, at a flat discount.",
  MIX_MATCH_GROUPED:
    "A step-by-step bundle: 'choose 1 candle, choose 1 bracelet, choose 1 care product'.",
};

const EXAMPLES: Record<(typeof OFFER_TYPES)[number], string> = {
  QUANTITY_BREAK: "Buy 3 candles, save 15%.",
  MIX_MATCH: "Choose any 3 products, save 15%.",
  MIX_MATCH_GROUPED: "Build a gift box: 1 candle + 1 bracelet + 1 care item.",
};

export default function NewOffer() {
  return (
    <s-page heading="What would you like to create?" back-action="/app/offers">
      <s-section>
        <s-stack direction="block" gap="base">
          {OFFER_TYPES.map((type) => (
            <s-box
              key={type}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="block" gap="small">
                <s-heading>{OFFER_TYPE_LABELS[type]}</s-heading>
                <s-paragraph>{DESCRIPTIONS[type]}</s-paragraph>
                <s-paragraph>
                  <s-text tone="neutral">Example: {EXAMPLES[type]}</s-text>
                </s-paragraph>
                <s-button href={`/app/offers/new/${type.toLowerCase().replace(/_/g, "-")}`}>
                  Create
                </s-button>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
