import type { QuantityBreakOfferData } from "./offers.server";

export interface ParsedQuantityBreakForm {
  intent: "draft" | "publish";
  data: QuantityBreakOfferData;
}

/** Parses the FormData submitted by app/components/QuantityBreakBuilder.tsx. */
export function parseQuantityBreakForm(formData: FormData): ParsedQuantityBreakForm {
  const intent = formData.get("intent") === "publish" ? "publish" : "draft";
  const name = String(formData.get("name") ?? "");
  const publicTitle = String(formData.get("publicTitle") ?? "");
  const description = String(formData.get("description") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");

  const products = JSON.parse(String(formData.get("products") ?? "[]")) as {
    id: string;
    title?: string;
    imageUrl?: string | null;
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
      products: products.map((p) => ({
        shopifyProductId: p.id,
        titleCache: p.title ?? null,
        imageCache: p.imageUrl ?? null,
      })),
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
