import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";

export const loader = async (args: LoaderFunctionArgs) => {
  await requireTenant(args);
  return { offerType: args.params.offerType };
};

/**
 * Placeholder for the type-specific builder forms (Quantity Break / Mix &
 * Match / Grouped Mix & Match). These are built in Phase 1, 2, and 4
 * respectively — see docs/ROADMAP.md.
 */
export default function NewOfferBuilder() {
  const { offerType } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Create Bundle" back-action="/app/offers/new">
      <s-section>
        <s-paragraph>
          The {offerType} builder is coming in a later phase of this project
          — see docs/ROADMAP.md.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
