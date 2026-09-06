import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useFetcher } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import {
  deleteOffer,
  getOwnedOffer,
  OfferConflictError,
  OfferNotFoundError,
  OfferValidationError,
  updateMixMatchGroupedOffer,
  updateMixMatchOffer,
  updateQuantityBreakOffer,
} from "../lib/offers.server";
import { EntitlementError } from "../lib/entitlements.server";
import { parseQuantityBreakForm } from "../lib/quantity-break-form.server";
import {
  publishQuantityBreakOffer,
  unpublishQuantityBreakOffer,
} from "../lib/quantity-break-publish.server";
import { parseMixMatchForm } from "../lib/mix-match-form.server";
import { parseMixMatchGroupedForm } from "../lib/mix-match-grouped-form.server";
import { publishMixMatchOffer, unpublishMixMatchOffer } from "../lib/mix-match-publish.server";
import { resyncMixMatchBundlesDisplay } from "../lib/shopify/mix-match-display-sync.server";
import { QuantityBreakBuilder } from "../components/QuantityBreakBuilder";
import { MixMatchBuilder } from "../components/MixMatchBuilder";
import { MixMatchGroupedBuilder } from "../components/MixMatchGroupedBuilder";

const CART_TRANSFORM_TYPES = new Set(["MIX_MATCH", "MIX_MATCH_GROUPED"]);

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireTenant(args);
  try {
    const offer = await getOwnedOffer(shop.id, args.params.id!);
    return { offer };
  } catch (error) {
    if (error instanceof OfferNotFoundError) {
      throw new Response("Offer not found", { status: 404 });
    }
    throw error;
  }
};

export const action = async (args: ActionFunctionArgs) => {
  const { shop, admin } = await requireTenant(args);
  const offerId = args.params.id!;
  const formData = await args.request.formData();
  const lifecycleIntent = formData.get("lifecycleIntent");

  try {
    const existingOffer = await getOwnedOffer(shop.id, offerId);

    if (lifecycleIntent === "delete") {
      await deleteOffer(shop.id, offerId);
      if (CART_TRANSFORM_TYPES.has(existingOffer.type) && existingOffer.status === "ACTIVE") {
        await resyncMixMatchBundlesDisplay(admin.graphql, shop.id);
      }
      return redirect("/app/offers");
    }
    if (lifecycleIntent === "pause") {
      if (CART_TRANSFORM_TYPES.has(existingOffer.type)) {
        await unpublishMixMatchOffer(admin.graphql, shop.id, offerId);
      } else {
        await unpublishQuantityBreakOffer(admin.graphql, shop.id, offerId);
      }
      return redirect(`/app/offers/${offerId}`);
    }

    if (existingOffer.type === "MIX_MATCH_GROUPED") {
      const previousVariantIds = existingOffer.variants.map((v) => v.shopifyVariantId);
      const { intent, data } = parseMixMatchGroupedForm(formData);
      await updateMixMatchGroupedOffer(shop.id, offerId, data);

      if (intent === "publish") {
        await publishMixMatchOffer(admin.graphql, shop.id, offerId, previousVariantIds);
      }
    } else if (existingOffer.type === "MIX_MATCH") {
      const previousVariantIds = existingOffer.variants.map((v) => v.shopifyVariantId);
      const { intent, data } = parseMixMatchForm(formData);
      await updateMixMatchOffer(shop.id, offerId, data);

      if (intent === "publish") {
        await publishMixMatchOffer(admin.graphql, shop.id, offerId, previousVariantIds);
      }
    } else {
      const { intent, data } = parseQuantityBreakForm(formData);
      await updateQuantityBreakOffer(shop.id, offerId, data);

      if (intent === "publish") {
        await publishQuantityBreakOffer(admin.graphql, shop.id, offerId);
      }
    }

    return redirect(`/app/offers/${offerId}`);
  } catch (error) {
    if (error instanceof OfferNotFoundError) {
      throw new Response("Offer not found", { status: 404 });
    }
    if (error instanceof OfferValidationError) {
      return { errors: error.errors };
    }
    if (error instanceof OfferConflictError) {
      return { errors: [error.message] };
    }
    if (error instanceof EntitlementError) {
      return { errors: [error.message] };
    }
    throw error;
  }
};

function OfferLifecycleActions({
  status,
  fetcher,
}: {
  status: string;
  fetcher: ReturnType<typeof useFetcher>;
}) {
  return (
    <s-section heading={`Status: ${status}`}>
      <s-stack direction="inline" gap="base">
        {status === "ACTIVE" && (
          <fetcher.Form method="post">
            <input type="hidden" name="lifecycleIntent" value="pause" />
            <s-button type="submit" variant="secondary">
              Pause offer
            </s-button>
          </fetcher.Form>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="lifecycleIntent" value="delete" />
          <s-button type="submit" variant="tertiary" tone="critical">
            Delete offer
          </s-button>
        </fetcher.Form>
      </s-stack>
    </s-section>
  );
}

export default function EditOffer() {
  const { offer } = useLoaderData<typeof loader>();
  const lifecycleFetcher = useFetcher();

  if (offer.type === "MIX_MATCH") {
    return (
      <>
        <MixMatchBuilder
          initial={{
            offerId: offer.id,
            name: offer.name,
            publicTitle: offer.publicTitle,
            description: offer.description ?? "",
            variants: offer.variants.map((v) => ({
              id: v.shopifyVariantId,
              title: v.titleCache ?? v.shopifyVariantId,
              imageUrl: v.imageCache,
              price: v.priceCache === null ? null : String(v.priceCache),
            })),
            minItems: offer.minItems ?? 3,
            maxItems: offer.maxItems ?? 3,
            allowDuplicates: offer.allowDuplicates,
            useTiers: offer.tiers.length > 0,
            discountType: (offer.discountType as "PERCENTAGE" | "FIXED_AMOUNT") ?? "PERCENTAGE",
            discountValue: offer.discountValue === null ? 15 : Number(offer.discountValue),
            tiers: offer.tiers.map((t) => ({
              quantity: t.quantity,
              discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
              discountValue: Number(t.discountValue),
              label: t.label ?? "",
            })),
            startsAt: offer.startsAt ? offer.startsAt.toISOString().slice(0, 10) : "",
            endsAt: offer.endsAt ? offer.endsAt.toISOString().slice(0, 10) : "",
            status: offer.status,
          }}
        />
        <s-section heading="Storefront block setup">
          <s-paragraph>
            If your theme shows more than one Mix &amp; Match bundle, paste this Bundle ID
            into the block&apos;s &quot;Bundle ID&quot; setting in the Theme Editor to pick
            this one. Stores with only one active Mix &amp; Match bundle can leave it blank.
          </s-paragraph>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <code>{offer.id}</code>
          </s-box>
        </s-section>
        <OfferLifecycleActions status={offer.status} fetcher={lifecycleFetcher} />
      </>
    );
  }

  if (offer.type === "MIX_MATCH_GROUPED") {
    return (
      <>
        <MixMatchGroupedBuilder
          initial={{
            offerId: offer.id,
            name: offer.name,
            publicTitle: offer.publicTitle,
            description: offer.description ?? "",
            groups: offer.groups.map((g) => ({
              key: g.id,
              name: g.name,
              description: g.description ?? "",
              minSelections: g.minSelections,
              maxSelections: g.maxSelections,
              required: g.required,
              allowDuplicates: g.allowDuplicates,
              variants: g.variants.map((v) => ({
                id: v.shopifyVariantId,
                title: v.titleCache ?? v.shopifyVariantId,
                imageUrl: v.imageCache,
                price: v.priceCache === null ? null : String(v.priceCache),
              })),
            })),
            useTiers: offer.tiers.length > 0,
            discountType: (offer.discountType as "PERCENTAGE" | "FIXED_AMOUNT") ?? "PERCENTAGE",
            discountValue: offer.discountValue === null ? 20 : Number(offer.discountValue),
            tiers: offer.tiers.map((t) => ({
              quantity: t.quantity,
              discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
              discountValue: Number(t.discountValue),
              label: t.label ?? "",
            })),
            startsAt: offer.startsAt ? offer.startsAt.toISOString().slice(0, 10) : "",
            endsAt: offer.endsAt ? offer.endsAt.toISOString().slice(0, 10) : "",
            status: offer.status,
          }}
        />
        <s-section heading="Storefront block setup">
          <s-paragraph>
            If your theme shows more than one Mix &amp; Match bundle (flat or grouped), paste
            this Bundle ID into the block&apos;s &quot;Bundle ID&quot; setting in the Theme
            Editor to pick this one. Stores with only one active bundle can leave it blank.
          </s-paragraph>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <code>{offer.id}</code>
          </s-box>
        </s-section>
        <OfferLifecycleActions status={offer.status} fetcher={lifecycleFetcher} />
      </>
    );
  }

  if (offer.type !== "QUANTITY_BREAK") {
    return (
      <s-page heading={offer.name} back-action="/app/offers">
        <s-section>
          <s-paragraph>
            The {offer.type} builder is coming in a later phase — see
            docs/ROADMAP.md.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  return (
    <>
      <QuantityBreakBuilder
        initial={{
          offerId: offer.id,
          name: offer.name,
          publicTitle: offer.publicTitle,
          description: offer.description ?? "",
          products: offer.products.map((p) => ({
            id: p.shopifyProductId,
            title: p.titleCache ?? p.shopifyProductId,
            imageUrl: p.imageCache,
          })),
          tiers: offer.tiers.map((t) => ({
            quantity: t.quantity,
            discountType: t.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
            discountValue: Number(t.discountValue),
            label: t.label ?? "",
          })),
          startsAt: offer.startsAt ? offer.startsAt.toISOString().slice(0, 10) : "",
          endsAt: offer.endsAt ? offer.endsAt.toISOString().slice(0, 10) : "",
          status: offer.status,
        }}
      />
      <OfferLifecycleActions status={offer.status} fetcher={lifecycleFetcher} />
    </>
  );
}
