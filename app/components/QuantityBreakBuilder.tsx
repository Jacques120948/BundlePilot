import { useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

export interface ProductSelection {
  id: string;
  title: string;
  imageUrl?: string | null;
}

export interface TierRow {
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  label: string;
}

export interface QuantityBreakBuilderInitialValues {
  offerId?: string;
  name: string;
  publicTitle: string;
  description: string;
  products: ProductSelection[];
  tiers: TierRow[];
  startsAt: string; // yyyy-mm-dd, or ""
  endsAt: string;
  status?: string;
}

const DEFAULT_TIERS: TierRow[] = [
  { quantity: 1, discountType: "PERCENTAGE", discountValue: 0, label: "" },
  { quantity: 2, discountType: "PERCENTAGE", discountValue: 10, label: "" },
  { quantity: 3, discountType: "PERCENTAGE", discountValue: 15, label: "" },
  { quantity: 4, discountType: "PERCENTAGE", discountValue: 20, label: "" },
];

export function emptyQuantityBreakValues(): QuantityBreakBuilderInitialValues {
  return {
    name: "",
    publicTitle: "Buy more & save",
    description: "",
    products: [],
    tiers: DEFAULT_TIERS,
    startsAt: "",
    endsAt: "",
  };
}

interface ActionResponse {
  errors?: string[];
}

/**
 * Shared create/edit form for Quantity Break offers. Not independently
 * verified in a live embedded admin session in this environment (no
 * Shopify Partner org linked here) — the Resource Picker call in particular
 * (`shopify.resourcePicker`) needs to be exercised inside real Shopify
 * Admin. See docs/ROADMAP.md Phase 1 "Verification status".
 */
export function QuantityBreakBuilder({
  initial,
}: {
  initial: QuantityBreakBuilderInitialValues;
}) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<ActionResponse>();

  const [name, setName] = useState(initial.name);
  const [publicTitle, setPublicTitle] = useState(initial.publicTitle);
  const [description, setDescription] = useState(initial.description);
  const [products, setProducts] = useState<ProductSelection[]>(initial.products);
  const [tiers, setTiers] = useState<TierRow[]>(initial.tiers);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [endsAt, setEndsAt] = useState(initial.endsAt);

  const isSubmitting = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? [];

  async function handlePickProducts() {
    const result = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: products.map((p) => ({ id: p.id })),
    });
    if (!result) return;

    type PickedProduct = {
      id: string;
      title: string;
      images?: { originalSrc?: string; url?: string }[];
    };
    const picked = result as unknown as PickedProduct[];

    setProducts(
      picked.map((p) => ({
        id: p.id,
        title: p.title,
        imageUrl: p.images?.[0]?.originalSrc ?? p.images?.[0]?.url ?? null,
      })),
    );
  }

  function removeProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  function updateTier(index: number, patch: Partial<TierRow>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTier() {
    const nextQuantity = (tiers.at(-1)?.quantity ?? 0) + 1;
    setTiers((prev) => [
      ...prev,
      { quantity: nextQuantity, discountType: "PERCENTAGE", discountValue: 0, label: "" },
    ]);
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  function submit(intent: "draft" | "publish") {
    fetcher.submit(
      {
        intent,
        name,
        publicTitle,
        description,
        products: JSON.stringify(
          products.map((p) => ({ id: p.id, title: p.title, imageUrl: p.imageUrl })),
        ),
        tiers: JSON.stringify(tiers),
        startsAt,
        endsAt,
      },
      { method: "post" },
    );
  }

  return (
    <s-page
      heading={initial.offerId ? "Edit Quantity Break" : "Create Quantity Break"}
      back-action="/app/offers"
    >
      {errors.length > 0 && (
        <s-section heading="Please fix the following">
          <s-unordered-list>
            {errors.map((err) => (
              <s-list-item key={err}>{err}</s-list-item>
            ))}
          </s-unordered-list>
        </s-section>
      )}

      <s-section heading="Details">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Offer name"
            details="Internal name, shown only in BundlePilot."
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <s-text-field
            label="Customer-facing title"
            details="Shown on the storefront block, e.g. 'Buy more & save'."
            value={publicTitle}
            onInput={(e) => setPublicTitle(e.currentTarget.value)}
          />
          <s-text-area
            label="Description (optional)"
            value={description}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </s-stack>
      </s-section>

      <s-section heading="Products">
        <s-stack direction="block" gap="base">
          <s-button onClick={handlePickProducts}>Select products</s-button>
          {products.length === 0 ? (
            <s-paragraph>
              <s-text tone="neutral">No products selected yet.</s-text>
            </s-paragraph>
          ) : (
            <s-unordered-list>
              {products.map((p) => (
                <s-list-item key={p.id}>
                  {p.title}{" "}
                  <s-button variant="tertiary" onClick={() => removeProduct(p.id)}>
                    Remove
                  </s-button>
                </s-list-item>
              ))}
            </s-unordered-list>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Quantity tiers">
        <s-stack direction="block" gap="base">
          {tiers.map((tier, index) => (
            <s-stack direction="inline" gap="base" key={index}>
              <s-number-field
                label="Quantity"
                value={String(tier.quantity)}
                onInput={(e) => updateTier(index, { quantity: Number(e.currentTarget.value) })}
              />
              <s-select
                label="Discount type"
                value={tier.discountType}
                onChange={(e) =>
                  updateTier(index, {
                    discountType: e.currentTarget.value as TierRow["discountType"],
                  })
                }
              >
                <s-option value="PERCENTAGE">Percentage</s-option>
                <s-option value="FIXED_AMOUNT">Fixed amount</s-option>
              </s-select>
              <s-number-field
                label={tier.discountType === "PERCENTAGE" ? "Discount %" : "Discount amount"}
                value={String(tier.discountValue)}
                onInput={(e) => updateTier(index, { discountValue: Number(e.currentTarget.value) })}
              />
              <s-text-field
                label="Badge label (optional)"
                value={tier.label}
                onInput={(e) => updateTier(index, { label: e.currentTarget.value })}
              />
              <s-button variant="tertiary" onClick={() => removeTier(index)}>
                Remove
              </s-button>
            </s-stack>
          ))}
          <s-button variant="secondary" onClick={addTier}>
            Add tier
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Schedule">
        <s-stack direction="inline" gap="base">
          <label>
            Start date (optional)
            <br />
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.currentTarget.value)}
            />
          </label>
          <label>
            End date (optional)
            <br />
            <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.currentTarget.value)} />
          </label>
        </s-stack>
      </s-section>

      <s-button
        slot="primary-action"
        {...(isSubmitting ? { loading: true } : {})}
        onClick={() => submit("publish")}
      >
        Save and activate
      </s-button>
      <s-button
        slot="secondary-actions"
        {...(isSubmitting ? { loading: true } : {})}
        onClick={() => submit("draft")}
      >
        Save as draft
      </s-button>
    </s-page>
  );
}
