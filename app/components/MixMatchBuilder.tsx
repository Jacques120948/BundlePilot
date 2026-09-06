import { useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

export interface VariantSelection {
  id: string;
  title: string;
  imageUrl?: string | null;
}

export interface MixMatchTierRow {
  quantity: number; // item count threshold
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  label: string;
}

export interface MixMatchBuilderInitialValues {
  offerId?: string;
  name: string;
  publicTitle: string;
  description: string;
  variants: VariantSelection[];
  minItems: number;
  maxItems: number;
  allowDuplicates: boolean;
  useTiers: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  tiers: MixMatchTierRow[];
  startsAt: string;
  endsAt: string;
  status?: string;
}

export function emptyMixMatchValues(): MixMatchBuilderInitialValues {
  return {
    name: "",
    publicTitle: "Compose your bundle",
    description: "",
    variants: [],
    minItems: 3,
    maxItems: 3,
    allowDuplicates: false,
    useTiers: false,
    discountType: "PERCENTAGE",
    discountValue: 15,
    tiers: [],
    startsAt: "",
    endsAt: "",
  };
}

interface ActionResponse {
  errors?: string[];
}

/**
 * Shared create/edit form for flat Mix & Match offers. Not independently
 * verified in a live embedded admin session in this environment — see
 * docs/ROADMAP.md Phase 2 "Verification status".
 */
export function MixMatchBuilder({ initial }: { initial: MixMatchBuilderInitialValues }) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<ActionResponse>();

  const [name, setName] = useState(initial.name);
  const [publicTitle, setPublicTitle] = useState(initial.publicTitle);
  const [description, setDescription] = useState(initial.description);
  const [variants, setVariants] = useState<VariantSelection[]>(initial.variants);
  const [minItems, setMinItems] = useState(initial.minItems);
  const [maxItems, setMaxItems] = useState(initial.maxItems);
  const [allowDuplicates, setAllowDuplicates] = useState(initial.allowDuplicates);
  const [useTiers, setUseTiers] = useState(initial.useTiers);
  const [discountType, setDiscountType] = useState(initial.discountType);
  const [discountValue, setDiscountValue] = useState(initial.discountValue);
  const [tiers, setTiers] = useState<MixMatchTierRow[]>(initial.tiers);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [endsAt, setEndsAt] = useState(initial.endsAt);

  const isSubmitting = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? [];

  async function handlePickVariants() {
    const result = await shopify.resourcePicker({
      type: "variant",
      multiple: true,
      selectionIds: variants.map((v) => ({ id: v.id })),
    });
    if (!result) return;

    type PickedVariant = {
      id: string;
      title?: string;
      displayName?: string;
      image?: { originalSrc?: string; url?: string };
    };
    const picked = result as unknown as PickedVariant[];

    setVariants(
      picked.map((v) => ({
        id: v.id,
        title: v.displayName ?? v.title ?? v.id,
        imageUrl: v.image?.originalSrc ?? v.image?.url ?? null,
      })),
    );
  }

  function removeVariant(id: string) {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  }

  function updateTier(index: number, patch: Partial<MixMatchTierRow>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTier() {
    const nextQuantity = (tiers.at(-1)?.quantity ?? minItems - 1) + 1;
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
        variants: JSON.stringify(variants.map((v) => ({ id: v.id, title: v.title, imageUrl: v.imageUrl }))),
        minItems: String(minItems),
        maxItems: String(maxItems),
        allowDuplicates: String(allowDuplicates),
        discountType: useTiers ? "" : discountType,
        discountValue: useTiers ? "" : String(discountValue),
        tiers: JSON.stringify(useTiers ? tiers : []),
        startsAt,
        endsAt,
      },
      { method: "post" },
    );
  }

  return (
    <s-page
      heading={initial.offerId ? "Edit Mix & Match" : "Create Mix & Match"}
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
            details="Shown on the storefront builder, e.g. 'Compose your bundle'."
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

      <s-section heading="Product pool">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text tone="neutral">
              Products or variants can come from any collection — there&apos;s no need to group
              them first.
            </s-text>
          </s-paragraph>
          <s-button onClick={handlePickVariants}>Select products or variants</s-button>
          {variants.length === 0 ? (
            <s-paragraph>
              <s-text tone="neutral">No products selected yet.</s-text>
            </s-paragraph>
          ) : (
            <s-unordered-list>
              {variants.map((v) => (
                <s-list-item key={v.id}>
                  {v.title}{" "}
                  <s-button variant="tertiary" onClick={() => removeVariant(v.id)}>
                    Remove
                  </s-button>
                </s-list-item>
              ))}
            </s-unordered-list>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Selection rules">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-number-field
              label="Minimum selection"
              value={String(minItems)}
              onInput={(e) => setMinItems(Number(e.currentTarget.value))}
            />
            <s-number-field
              label="Maximum selection"
              value={String(maxItems)}
              onInput={(e) => setMaxItems(Number(e.currentTarget.value))}
            />
          </s-stack>
          <s-checkbox
            label="Allow the same product to be selected more than once"
            checked={allowDuplicates}
            onChange={(e) => setAllowDuplicates(e.currentTarget.checked)}
          />
        </s-stack>
      </s-section>

      <s-section heading="Discount">
        <s-stack direction="block" gap="base">
          <s-checkbox
            label="Use quantity tiers instead of a single discount"
            checked={useTiers}
            onChange={(e) => setUseTiers(e.currentTarget.checked)}
          />

          {!useTiers ? (
            <s-stack direction="inline" gap="base">
              <s-select
                label="Discount type"
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.currentTarget.value as "PERCENTAGE" | "FIXED_AMOUNT")
                }
              >
                <s-option value="PERCENTAGE">Percentage</s-option>
                <s-option value="FIXED_AMOUNT">Fixed amount</s-option>
              </s-select>
              <s-number-field
                label={discountType === "PERCENTAGE" ? "Discount %" : "Discount amount"}
                value={String(discountValue)}
                onInput={(e) => setDiscountValue(Number(e.currentTarget.value))}
              />
            </s-stack>
          ) : (
            <s-stack direction="block" gap="base">
              {tiers.map((tier, index) => (
                <s-stack direction="inline" gap="base" key={index}>
                  <s-number-field
                    label="Items"
                    value={String(tier.quantity)}
                    onInput={(e) => updateTier(index, { quantity: Number(e.currentTarget.value) })}
                  />
                  <s-select
                    label="Discount type"
                    value={tier.discountType}
                    onChange={(e) =>
                      updateTier(index, {
                        discountType: e.currentTarget.value as MixMatchTierRow["discountType"],
                      })
                    }
                  >
                    <s-option value="PERCENTAGE">Percentage</s-option>
                    <s-option value="FIXED_AMOUNT">Fixed amount</s-option>
                  </s-select>
                  <s-number-field
                    label={tier.discountType === "PERCENTAGE" ? "Discount %" : "Discount amount"}
                    value={String(tier.discountValue)}
                    onInput={(e) =>
                      updateTier(index, { discountValue: Number(e.currentTarget.value) })
                    }
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
          )}
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
