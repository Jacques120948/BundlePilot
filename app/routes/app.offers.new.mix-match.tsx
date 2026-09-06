import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import {
  createMixMatchDraft,
  OfferConflictError,
  OfferValidationError,
} from "../lib/offers.server";
import { EntitlementError } from "../lib/entitlements.server";
import { parseMixMatchForm } from "../lib/mix-match-form.server";
import { publishMixMatchOffer } from "../lib/mix-match-publish.server";
import { MixMatchBuilder, emptyMixMatchValues } from "../components/MixMatchBuilder";

export const loader = async (args: LoaderFunctionArgs) => {
  await requireTenant(args);
  return null;
};

export const action = async (args: ActionFunctionArgs) => {
  const { shop, admin } = await requireTenant(args);
  const formData = await args.request.formData();
  const { intent, data } = parseMixMatchForm(formData);

  try {
    const offer = await createMixMatchDraft(shop.id, data);

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

export default function NewMixMatch() {
  useLoaderData<typeof loader>();
  return <MixMatchBuilder initial={emptyMixMatchValues()} />;
}
