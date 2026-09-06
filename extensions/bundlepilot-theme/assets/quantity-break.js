/**
 * BundlePilot Quantity Break storefront block.
 *
 * This is a *display* widget: the price it shows is a preview computed
 * from the same tier config the merchant configured. The real discount is
 * always (re)computed by Shopify's Discount Function at cart/checkout time
 * — see docs/DISCOUNT_ENGINE.md and docs/SECURITY.md "Cart security". This
 * script never sends a discount amount to the cart; it only ever sends a
 * variant id + quantity to Shopify's own /cart/add.js endpoint.
 */
(function () {
  "use strict";

  function formatMoney(cents, currency) {
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: "currency",
        currency,
      }).format(cents / 100);
    } catch {
      return (cents / 100).toFixed(2) + " " + currency;
    }
  }

  function priceForQuantity(unitPrice, quantity, tier) {
    const subtotal = unitPrice * quantity;
    if (!tier || tier.discountValue <= 0) return subtotal;
    if (tier.discountType === "PERCENTAGE") {
      return Math.round(subtotal * (1 - tier.discountValue / 100));
    }
    // FIXED_AMOUNT is applied once to the whole line, matching the
    // Discount Function's semantics — see docs/DISCOUNT_ENGINE.md.
    return Math.max(0, subtotal - tier.discountValue * 100);
  }

  function renderTiers(root, config, unitPrice, currency, showSavings) {
    const tiersContainer = root.querySelector("[data-bundlepilot-tiers]");
    const addButton = root.querySelector("[data-bundlepilot-add]");
    tiersContainer.innerHTML = "";

    let selectedQuantity = config.tiers[0] ? config.tiers[0].quantity : 1;

    const fieldset = document.createElement("fieldset");
    fieldset.className = "bundlepilot-qb__fieldset";

    const legend = document.createElement("legend");
    legend.className = "bundlepilot-qb__legend";
    legend.textContent = config.publicTitle || "Buy more & save";
    fieldset.appendChild(legend);

    config.tiers.forEach((tier, index) => {
      const tierPrice = priceForQuantity(unitPrice, tier.quantity, tier);
      const regularPrice = unitPrice * tier.quantity;
      const savings = regularPrice - tierPrice;

      const label = document.createElement("label");
      label.className = "bundlepilot-qb__option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "bundlepilot-qb-tier";
      input.value = String(tier.quantity);
      input.checked = index === 0;
      input.addEventListener("change", () => {
        selectedQuantity = tier.quantity;
        addButton.disabled = false;
        addButton.dataset.quantity = String(selectedQuantity);
      });

      // Built with DOM APIs (not innerHTML) so the merchant-authored tier
      // label is always inserted as text, never parsed as markup.
      const text = document.createElement("span");
      text.className = "bundlepilot-qb__option-text";
      const pieceWord = tier.quantity === 1 ? "piece" : "pieces";

      const quantityStrong = document.createElement("strong");
      quantityStrong.textContent = `${tier.quantity} ${pieceWord}`;
      text.appendChild(quantityStrong);
      text.appendChild(document.createTextNode(` — ${formatMoney(tierPrice, currency)}`));

      if (showSavings && savings > 0) {
        const savingsSpan = document.createElement("span");
        savingsSpan.className = "bundlepilot-qb__savings";
        savingsSpan.textContent = ` Save ${formatMoney(savings, currency)}`;
        text.appendChild(savingsSpan);
      }
      if (tier.label) {
        const badge = document.createElement("span");
        badge.className = "bundlepilot-qb__badge";
        badge.textContent = tier.label;
        text.appendChild(badge);
      }

      label.appendChild(input);
      label.appendChild(text);
      fieldset.appendChild(label);
    });

    tiersContainer.appendChild(fieldset);
    addButton.disabled = false;
    addButton.dataset.quantity = String(selectedQuantity);
  }

  async function addToCart(root, variantId) {
    const addButton = root.querySelector("[data-bundlepilot-add]");
    const errorEl = root.querySelector("[data-bundlepilot-error]");
    const quantity = Number(addButton.dataset.quantity || "1");

    errorEl.hidden = true;
    addButton.disabled = true;
    addButton.textContent = "Adding…";

    try {
      const response = await fetch(window.Shopify?.routes?.root
        ? `${window.Shopify.routes.root}cart/add.js`
        : "/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity }] }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.description || "This item is no longer available.");
      }

      document.dispatchEvent(new CustomEvent("bundlepilot:added-to-cart", { detail: { variantId, quantity } }));
      window.location.href = (window.Shopify?.routes?.root || "/") + "cart";
    } catch (error) {
      errorEl.textContent =
        "We couldn't add this to your cart. Please try again. " +
        "(" + (error instanceof Error ? error.message : "Unknown error") + ")";
      errorEl.hidden = false;
      addButton.disabled = false;
      addButton.textContent = "Add to cart";
    }
  }

  function init(root) {
    let config;
    try {
      config = JSON.parse(root.dataset.config || "{}");
    } catch {
      return;
    }
    if (!Array.isArray(config.tiers) || config.tiers.length === 0) return;

    const unitPrice = Number(root.dataset.unitPrice || "0");
    const currency = root.dataset.currency || "USD";
    const showSavings = root.dataset.showSavings === "true";
    const variantId = root.dataset.variantId;

    renderTiers(root, config, unitPrice, currency, showSavings);

    const addButton = root.querySelector("[data-bundlepilot-add]");
    addButton.addEventListener("click", () => addToCart(root, variantId));
  }

  document.querySelectorAll("[data-bundlepilot-quantity-break]").forEach(init);
})();
