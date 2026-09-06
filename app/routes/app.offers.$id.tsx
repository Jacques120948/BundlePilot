import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useFetcher } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import {
  deleteOffer,
  getOwnedOffer,
  OfferConflictError,
  OfferNotFoundError,
  OfferValidationError,
  updateQuantityBreakOffer,
} from "../lib/offers.server";
import { EntitlementError } from "../lib/entitlements.server";
import { parseQuantityBreakForm } from "../lib/quantity-break-form.server";
import {
  publishQuantityBreakOffer,
  unpublishQuantityBreakOffer,
} from "../lib/quantity-break-publish.server";
import { QuantityBreakBuilder } from "../components/QuantityBreakBuilder";

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
    if (lifecycleIntent === "delete") {
      await deleteOffer(shop.id, offerId);
      return redirect("/app/offers");
    }
    if (lifecycleIntent === "pause") {
      await unpublishQuantityBreakOffer(admin.graphql, shop.id, offerId);
      return redirect(`/app/offers/${offerId}`);
    }

    const { intent, data } = parseQuantityBreakForm(formData);
    await updateQuantityBreakOffer(shop.id, offerId, data);

    if (intent === "publish") {
      await publishQuantityBreakOffer(admin.graphql, shop.id, offerId);
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

export default function EditOffer() {
  const { offer } = useLoaderData<typeof loader>();
  const lifecycleFetcher = useFetcher();

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
      <s-section heading={`Status: ${offer.status}`}>
        <s-stack direction="inline" gap="base">
          {offer.status === "ACTIVE" && (
            <lifecycleFetcher.Form method="post">
              <input type="hidden" name="lifecycleIntent" value="pause" />
              <s-button type="submit" variant="secondary">
                Pause offer
              </s-button>
            </lifecycleFetcher.Form>
          )}
          <lifecycleFetcher.Form method="post">
            <input type="hidden" name="lifecycleIntent" value="delete" />
            <s-button type="submit" variant="tertiary" tone="critical">
              Delete offer
            </s-button>
          </lifecycleFetcher.Form>
        </s-stack>
      </s-section>
    </>
  );
}
