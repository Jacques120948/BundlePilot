import type { MixMatchGroupedOfferData } from "./offers.server";

export interface ParsedMixMatchGroupedForm {
  intent: "draft" | "publish";
  data: MixMatchGroupedOfferData;
}

interface RawGroup {
  name: string;
  description?: string;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  allowDuplicates: boolean;
  variants: { id: string; title?: string; imageUrl?: string | null; price?: string | number | null }[];
}

/** Parses the FormData submitted by app/components/MixMatchGroupedBuilder.tsx. */
export function parseMixMatchGroupedForm(formData: FormData): ParsedMixMatchGroupedForm {
  const intent = formData.get("intent") === "publish" ? "publish" : "draft";
  const name = String(formData.get("name") ?? "");
  const publicTitle = String(formData.get("publicTitle") ?? "");
  const description = String(formData.get("description") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");

  const rawDiscountType = String(formData.get("discountType") ?? "");
  const discountType =
    rawDiscountType === "PERCENTAGE" || rawDiscountType === "FIXED_AMOUNT" ? rawDiscountType : null;
  const rawDiscountValue = formData.get("discountValue");
  const discountValue =
    rawDiscountValue === null || rawDiscountValue === "" ? null : Number(rawDiscountValue);

  const groups = JSON.parse(String(formData.get("groups") ?? "[]")) as RawGroup[];
  const tiers = JSON.parse(String(formData.get("tiers") ?? "[]")) as {
    quantity: number;
    discountType: "PERCENTAGE" | "FIXED_AMOUNT";
    discountValue: number;
    label?: string;
  }[];

  return {
    intent,
    data: {
      name,
      publicTitle,
      description: description || null,
      groups: groups.map((g) => ({
        name: g.name,
        description: g.description || null,
        minSelections: Number(g.minSelections),
        maxSelections: Number(g.maxSelections),
        required: Boolean(g.required),
        allowDuplicates: Boolean(g.allowDuplicates),
        variants: g.variants.map((v) => ({
          shopifyVariantId: v.id,
          titleCache: v.title || null,
          imageCache: v.imageUrl || null,
          priceCache:
            v.price === null || v.price === undefined || v.price === "" ? null : Number(v.price),
        })),
      })),
      discountType,
      discountValue,
      tiers: tiers.map((t) => ({
        quantity: Number(t.quantity),
        discountType: t.discountType,
        discountValue: Number(t.discountValue),
        label: t.label || null,
      })),
      startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
      endsAt: endsAtRaw ? new Date(endsAtRaw) : null,
    },
  };
}
