import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import {
  createMixMatchGroupedDraft,
  OfferConflictError,
  OfferValidationError,
} from "../lib/offers.server";
import { EntitlementError } from "../lib/entitlements.server";
import { parseMixMatchGroupedForm } from "../lib/mix-match-grouped-form.server";
import { publishMixMatchOffer } from "../lib/mix-match-publish.server";
import {
  MixMatchGroupedBuilder,
  emptyMixMatchGroupedValues,
} from "../components/MixMatchGroupedBuilder";

export const loader = async (args: LoaderFunctionArgs) => {
  await requireTenant(args);
  return null;
};

export const action = async (args: ActionFunctionArgs) => {
  const { shop, admin } = await requireTenant(args);
  const formData = await args.request.formData();
  const { intent, data } = parseMixMatchGroupedForm(formData);

  try {
    const offer = await createMixMatchGroupedDraft(shop.id, data);

    if (intent === "publish") {
      // A brand-new offer has no previous pool to diff against.
      await publishMixMatchOffer(admin.graphql, shop.id, offer.id, []);
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

export default function NewMixMatchGrouped() {
  useLoaderData<typeof loader>();
  return <MixMatchGroupedBuilder initial={emptyMixMatchGroupedValues()} />;
}
