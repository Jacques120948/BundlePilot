import { useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { VariantSelection, MixMatchTierRow } from "./MixMatchBuilder";

export interface GroupRow {
  key: string; // client-side only, stable across reorders/re-renders
  name: string;
  description: string;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  allowDuplicates: boolean;
  variants: VariantSelection[];
}

export interface MixMatchGroupedBuilderInitialValues {
  offerId?: string;
  name: string;
  publicTitle: string;
  description: string;
  groups: GroupRow[];
  useTiers: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  tiers: MixMatchTierRow[];
  startsAt: string;
  endsAt: string;
  status?: string;
}

function newGroupKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `grp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function emptyGroup(): GroupRow {
  return {
    key: newGroupKey(),
    name: "",
    description: "",
    minSelections: 1,
    maxSelections: 1,
    required: true,
    allowDuplicates: false,
    variants: [],
  };
}

export function emptyMixMatchGroupedValues(): MixMatchGroupedBuilderInitialValues {
  return {
    name: "",
    publicTitle: "Build your bundle",
    description: "",
    groups: [emptyGroup()],
    useTiers: false,
    discountType: "PERCENTAGE",
    discountValue: 20,
    tiers: [],
    startsAt: "",
    endsAt: "",
  };
}

interface ActionResponse {
  errors?: string[];
}

/**
 * Shared create/edit form for Grouped Mix & Match offers ("Choose 1 candle
 * + choose 1 bracelet"). Each group is its own product pool with its own
 * min/max/required/allowDuplicates rules — see docs/MIX_MATCH_ENGINE.md
 * "Grouped bundles". Not independently verified in a live embedded admin
 * session in this environment — see docs/ROADMAP.md Phase 4 "Verification
 * status".
 */
export function MixMatchGroupedBuilder({
  initial,
}: {
  initial: MixMatchGroupedBuilderInitialValues;
}) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<ActionResponse>();

  const [name, setName] = useState(initial.name);
  const [publicTitle, setPublicTitle] = useState(initial.publicTitle);
  const [description, setDescription] = useState(initial.description);
  const [groups, setGroups] = useState<GroupRow[]>(initial.groups);
  const [useTiers, setUseTiers] = useState(initial.useTiers);
  const [discountType, setDiscountType] = useState(initial.discountType);
  const [discountValue, setDiscountValue] = useState(initial.discountValue);
  const [tiers, setTiers] = useState<MixMatchTierRow[]>(initial.tiers);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [endsAt, setEndsAt] = useState(initial.endsAt);

  const isSubmitting = fetcher.state !== "idle";
  const errors = fetcher.data?.errors ?? [];

  function updateGroup(key: string, patch: Partial<GroupRow>) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    setGroups((prev) => [...prev, emptyGroup()]);
  }

  function removeGroup(key: string) {
    setGroups((prev) => prev.filter((g) => g.key !== key));
  }

  function moveGroup(key: string, direction: -1 | 1) {
    setGroups((prev) => {
      const index = prev.findIndex((g) => g.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handlePickVariants(key: string) {
    const group = groups.find((g) => g.key === key);
    if (!group) return;

    const result = await shopify.resourcePicker({
      type: "variant",
      multiple: true,
      selectionIds: group.variants.map((v) => ({ id: v.id })),
    });
    if (!result) return;

    type PickedVariant = {
      id: string;
      title?: string;
      displayName?: string;
      price?: string;
      image?: { originalSrc?: string; url?: string };
    };
    const picked = result as unknown as PickedVariant[];

    updateGroup(key, {
      variants: picked.map((v) => ({
        id: v.id,
        title: v.displayName ?? v.title ?? v.id,
        imageUrl: v.image?.originalSrc ?? v.image?.url ?? null,
        price: v.price ?? null,
      })),
    });
  }

  function removeVariant(groupKey: string, variantId: string) {
    const group = groups.find((g) => g.key === groupKey);
    if (!group) return;
    updateGroup(groupKey, { variants: group.variants.filter((v) => v.id !== variantId) });
  }

  function updateTier(index: number, patch: Partial<MixMatchTierRow>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTier() {
    const nextQuantity = (tiers.at(-1)?.quantity ?? 1) + 1;
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
        groups: JSON.stringify(
          groups.map((g) => ({
            name: g.name,
            description: g.description,
            minSelections: g.minSelections,
            maxSelections: g.maxSelections,
            required: g.required,
            allowDuplicates: g.allowDuplicates,
            variants: g.variants.map((v) => ({
              id: v.id,
              title: v.title,
              imageUrl: v.imageUrl,
              price: v.price,
            })),
          })),
        ),
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
      heading={initial.offerId ? "Edit Grouped Mix & Match" : "Create Grouped Mix & Match"}
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
            details="Shown on the storefront builder, e.g. 'Build your bundle'."
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

      {groups.map((group, index) => (
        <s-section key={group.key} heading={`Group ${index + 1}${group.name ? `: ${group.name}` : ""}`}>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-button
                variant="tertiary"
                disabled={index === 0}
                onClick={() => moveGroup(group.key, -1)}
              >
                Move up
              </s-button>
              <s-button
                variant="tertiary"
                disabled={index === groups.length - 1}
                onClick={() => moveGroup(group.key, 1)}
              >
                Move down
              </s-button>
              <s-button
                variant="tertiary"
                tone="critical"
                disabled={groups.length <= 1}
                onClick={() => removeGroup(group.key)}
              >
                Remove group
              </s-button>
            </s-stack>

            <s-text-field
              label="Group name"
              details='Shown to customers as a step, e.g. "Choose 1 candle".'
              value={group.name}
              onInput={(e) => updateGroup(group.key, { name: e.currentTarget.value })}
            />

            <s-stack direction="inline" gap="base">
              <s-number-field
                label="Minimum selection"
                value={String(group.minSelections)}
                onInput={(e) =>
                  updateGroup(group.key, { minSelections: Number(e.currentTarget.value) })
                }
              />
              <s-number-field
                label="Maximum selection"
                value={String(group.maxSelections)}
                onInput={(e) =>
                  updateGroup(group.key, { maxSelections: Number(e.currentTarget.value) })
                }
              />
            </s-stack>
            <s-checkbox
              label="Required — customer must complete this group to add the bundle"
              checked={group.required}
              onChange={(e) => updateGroup(group.key, { required: e.currentTarget.checked })}
            />
            <s-checkbox
              label="Allow the same product to be selected more than once in this group"
              checked={group.allowDuplicates}
              onChange={(e) => updateGroup(group.key, { allowDuplicates: e.currentTarget.checked })}
            />

            <s-button onClick={() => handlePickVariants(group.key)}>
              Select products or variants for this group
            </s-button>
            {group.variants.length === 0 ? (
              <s-paragraph>
                <s-text tone="neutral">No products selected yet.</s-text>
              </s-paragraph>
            ) : (
              <s-unordered-list>
                {group.variants.map((v) => (
                  <s-list-item key={v.id}>
                    {v.title}{" "}
                    <s-button variant="tertiary" onClick={() => removeVariant(group.key, v.id)}>
                      Remove
                    </s-button>
                  </s-list-item>
                ))}
              </s-unordered-list>
            )}
          </s-stack>
        </s-section>
      ))}

      <s-section>
        <s-button variant="secondary" onClick={addGroup}>
          Add group
        </s-button>
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
              <s-paragraph>
                <s-text tone="neutral">
                  Tiers are based on the total number of items selected across every group.
                </s-text>
              </s-paragraph>
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
