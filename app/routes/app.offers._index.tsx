import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { requireTenant } from "../lib/tenant.server";
import { listOffers } from "../lib/offers.server";
import { OFFER_TYPE_LABELS } from "../lib/offer-types";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireTenant(args);
  const offers = await listOffers(shop.id);
  return { offers };
};

export default function OffersIndex() {
  const { offers } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Offers">
      <s-button slot="primary-action" href="/app/offers/new">
        Create Bundle
      </s-button>
      <s-section heading="Your offers">
        {offers.length === 0 ? (
          <s-paragraph>
            No offers yet. Create your first Quantity Break or Mix &amp; Match
            bundle.
          </s-paragraph>
        ) : (
          <s-unordered-list>
            {offers.map((offer) => (
              <s-list-item key={offer.id}>
                <s-link href={`/app/offers/${offer.id}`}>{offer.name}</s-link> —{" "}
                {OFFER_TYPE_LABELS[offer.type]} — {offer.status}
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>
    </s-page>
  );
}
