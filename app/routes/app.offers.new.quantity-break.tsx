import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import {
  createQuantityBreakDraft,
  OfferConflictError,
  OfferValidationError,
} from "../lib/offers.server";
import { EntitlementError } from "../lib/entitlements.server";
import { parseQuantityBreakForm } from "../lib/quantity-break-form.server";
import { publishQuantityBreakOffer } from "../lib/quantity-break-publish.server";
import {
  QuantityBreakBuilder,
  emptyQuantityBreakValues,
} from "../components/QuantityBreakBuilder";

export const loader = async (args: LoaderFunctionArgs) => {
  await requireTenant(args);
  return null;
};

export const action = async (args: ActionFunctionArgs) => {
  const { shop, admin } = await requireTenant(args);
  const formData = await args.request.formData();
  const { intent, data } = parseQuantityBreakForm(formData);

  try {
    const offer = await createQuantityBreakDraft(shop.id, data);

    if (intent === "publish") {
      await publishQuantityBreakOffer(admin.graphql, shop.id, offer.id);
    }

    return redirect(`/app/offers/${offer.id}`);
  } catch (error) {
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

export default function NewQuantityBreak() {
  useLoaderData<typeof loader>();
  return <QuantityBreakBuilder initial={emptyQuantityBreakValues()} />;
}
