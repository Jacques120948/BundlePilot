import type { MixMatchOfferData } from "./offers.server";

export interface ParsedMixMatchForm {
  intent: "draft" | "publish";
  data: MixMatchOfferData;
}

/** Parses the FormData submitted by app/components/MixMatchBuilder.tsx. */
export function parseMixMatchForm(formData: FormData): ParsedMixMatchForm {
  const intent = formData.get("intent") === "publish" ? "publish" : "draft";
  const name = String(formData.get("name") ?? "");
  const publicTitle = String(formData.get("publicTitle") ?? "");
  const description = String(formData.get("description") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");
  const minItems = Number(formData.get("minItems") ?? 0);
  const maxItems = Number(formData.get("maxItems") ?? 0);
  const allowDuplicates = String(formData.get("allowDuplicates") ?? "false") === "true";

  const rawDiscountType = String(formData.get("discountType") ?? "");
  const discountType =
    rawDiscountType === "PERCENTAGE" || rawDiscountType === "FIXED_AMOUNT" ? rawDiscountType : null;
  const rawDiscountValue = formData.get("discountValue");
  const discountValue =
    rawDiscountValue === null || rawDiscountValue === "" ? null : Number(rawDiscountValue);

  const variants = JSON.parse(String(formData.get("variants") ?? "[]")) as {
    id: string;
    title?: string;
    imageUrl?: string | null;
    price?: string | number | null;
  }[];
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
      variants: variants.map((v) => ({
        shopifyVariantId: v.id,
        titleCache: v.title || null,
        imageCache: v.imageUrl || null,
        priceCache: v.price === null || v.price === undefined || v.price === "" ? null : Number(v.price),
      })),
      minItems,
      maxItems,
      allowDuplicates,
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
