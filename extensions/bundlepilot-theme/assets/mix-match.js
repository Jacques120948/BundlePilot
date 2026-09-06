/**
 * BundlePilot Mix & Match bundle builder.
 *
 * Display-only preview: the price shown here is computed from the same
 * config the merchant configured, purely so the customer can see what
 * they're building. The real discount is always (re)computed by the Cart
 * Transform Function at cart/checkout time from a completely separate
 * per-variant metafield this script never reads — see
 * docs/CART_TRANSFORM.md and docs/SECURITY.md "Cart security". This
 * script never sends a discount amount to the cart; it only ever sends
 * variant ids + quantities + an offer/session identifier pair to
 * Shopify's own /cart/add.js endpoint.
 */
(function () {
  "use strict";

  function formatMoney(amount, currency) {
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: "currency",
        currency,
      }).format(amount);
    } catch {
      return amount.toFixed(2) + " " + currency;
    }
  }

  function generateSessionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "bp-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  function pickBundle(config, bundleId) {
    const keys = Object.keys(config || {});
    if (bundleId && config[bundleId]) return config[bundleId];
    if (keys.length === 1) return config[keys[0]];
    return null;
  }

  function selectTier(tiers, itemCount) {
    let best = null;
    for (const tier of tiers) {
      if (itemCount >= tier.quantity && (!best || tier.quantity > best.quantity)) {
        best = tier;
      }
    }
    return best;
  }

  function computeSummary(bundle, selections) {
    let regular = 0;
    let totalItems = 0;
    for (const product of bundle.products) {
      const qty = selections.get(product.variantId) || 0;
      totalItems += qty;
      if (product.price != null) regular += product.price * qty;
    }

    let discountType = bundle.discountType;
    let discountValue = bundle.discountValue;
    if (Array.isArray(bundle.tiers) && bundle.tiers.length > 0) {
      const tier = selectTier(bundle.tiers, totalItems);
      discountType = tier ? tier.discountType : null;
      discountValue = tier ? tier.discountValue : null;
    }

    let bundlePrice = regular;
    if (discountType && discountValue > 0) {
      bundlePrice =
        discountType === "PERCENTAGE"
          ? regular * (1 - discountValue / 100)
          : Math.max(0, regular - discountValue);
    }

    return {
      totalItems,
      regular,
      bundlePrice,
      savings: regular - bundlePrice,
      isComplete: totalItems >= bundle.minItems && totalItems <= bundle.maxItems,
    };
  }

  function render(root, bundle, currency, showSavings) {
    const selections = new Map();
    root.innerHTML = "";

    const container = document.createElement("div");
    container.className = "bundlepilot-mm__container";

    const heading = document.createElement("h3");
    heading.className = "bundlepilot-mm__heading";
    heading.textContent = bundle.publicTitle;
    container.appendChild(heading);

    if (bundle.description) {
      const desc = document.createElement("p");
      desc.className = "bundlepilot-mm__description";
      desc.textContent = bundle.description;
      container.appendChild(desc);
    }

    const progress = document.createElement("p");
    progress.className = "bundlepilot-mm__progress";
    container.appendChild(progress);

    const grid = document.createElement("div");
    grid.className = "bundlepilot-mm__grid";
    container.appendChild(grid);

    const summary = document.createElement("div");
    summary.className = "bundlepilot-mm__summary";
    container.appendChild(summary);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "bundlepilot-mm__add";
    addButton.textContent = "Add bundle to cart";
    addButton.disabled = true;
    container.appendChild(addButton);

    const errorEl = document.createElement("p");
    errorEl.className = "bundlepilot-mm__error";
    errorEl.hidden = true;
    container.appendChild(errorEl);

    function update() {
      const summaryData = computeSummary(bundle, selections);

      progress.textContent = bundle.minItems === bundle.maxItems
        ? `${summaryData.totalItems} / ${bundle.maxItems} selected`
        : `${summaryData.totalItems} selected (choose ${bundle.minItems}–${bundle.maxItems})`;

      summary.innerHTML = "";
      if (summaryData.totalItems > 0) {
        const regularRow = document.createElement("p");
        regularRow.textContent = `Regular price: ${formatMoney(summaryData.regular, currency)}`;
        summary.appendChild(regularRow);

        if (showSavings && summaryData.savings > 0) {
          const savingsRow = document.createElement("p");
          savingsRow.className = "bundlepilot-mm__savings";
          savingsRow.textContent = `You save: ${formatMoney(summaryData.savings, currency)}`;
          summary.appendChild(savingsRow);
        }

        const bundleRow = document.createElement("p");
        bundleRow.className = "bundlepilot-mm__bundle-price";
        bundleRow.textContent = `Bundle price: ${formatMoney(summaryData.bundlePrice, currency)}`;
        summary.appendChild(bundleRow);
      }

      const completeBadge = grid.querySelector("[data-bundlepilot-complete-badge]");
      if (completeBadge) completeBadge.remove();
      if (summaryData.isComplete) {
        const badge = document.createElement("p");
        badge.className = "bundlepilot-mm__complete";
        badge.dataset.bundlepilotCompleteBadge = "true";
        badge.textContent = "Bundle complete ✓";
        container.insertBefore(badge, summary);
      }

      addButton.disabled = !summaryData.isComplete;

      // Disable further increments once maxItems is reached, without
      // touching already-selected quantities.
      grid.querySelectorAll("[data-bundlepilot-increment]").forEach((btn) => {
        btn.disabled = summaryData.totalItems >= bundle.maxItems;
      });
      grid.querySelectorAll("[data-bundlepilot-checkbox]").forEach((input) => {
        const variantId = input.dataset.variantId;
        if (!selections.get(variantId)) {
          input.disabled = summaryData.totalItems >= bundle.maxItems;
        }
      });
    }

    bundle.products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "bundlepilot-mm__card";

      if (product.imageUrl) {
        const img = document.createElement("img");
        img.src = product.imageUrl;
        img.alt = product.title;
        img.loading = "lazy";
        card.appendChild(img);
      }

      const title = document.createElement("p");
      title.className = "bundlepilot-mm__card-title";
      title.textContent = product.title;
      card.appendChild(title);

      if (product.price != null) {
        const price = document.createElement("p");
        price.className = "bundlepilot-mm__card-price";
        price.textContent = formatMoney(product.price, currency);
        card.appendChild(price);
      }

      if (bundle.allowDuplicates) {
        const stepper = document.createElement("div");
        stepper.className = "bundlepilot-mm__stepper";

        const decrement = document.createElement("button");
        decrement.type = "button";
        decrement.textContent = "−";
        decrement.setAttribute("aria-label", `Remove one ${product.title}`);

        const countEl = document.createElement("span");
        countEl.textContent = "0";
        countEl.setAttribute("aria-live", "polite");

        const increment = document.createElement("button");
        increment.type = "button";
        increment.textContent = "+";
        increment.dataset.bundlepilotIncrement = "true";
        increment.setAttribute("aria-label", `Add one ${product.title}`);

        decrement.addEventListener("click", () => {
          const current = selections.get(product.variantId) || 0;
          if (current > 0) selections.set(product.variantId, current - 1);
          countEl.textContent = String(selections.get(product.variantId) || 0);
          update();
        });
        increment.addEventListener("click", () => {
          const current = selections.get(product.variantId) || 0;
          selections.set(product.variantId, current + 1);
          countEl.textContent = String(current + 1);
          update();
        });

        stepper.append(decrement, countEl, increment);
        card.appendChild(stepper);
      } else {
        const label = document.createElement("label");
        label.className = "bundlepilot-mm__checkbox-label";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.bundlepilotCheckbox = "true";
        checkbox.dataset.variantId = product.variantId;

        checkbox.addEventListener("change", () => {
          selections.set(product.variantId, checkbox.checked ? 1 : 0);
          update();
        });

        const labelText = document.createElement("span");
        labelText.textContent = "Select";

        label.append(checkbox, labelText);
        card.appendChild(label);
      }

      grid.appendChild(card);
    });

    addButton.addEventListener("click", async () => {
      const items = bundle.products
        .filter((p) => (selections.get(p.variantId) || 0) > 0)
        .map((p) => ({
          id: Number(p.variantId.split("/").pop()),
          quantity: selections.get(p.variantId),
          properties: {
            _bp_offer: bundle.offerId,
            _bp_session: generateSessionId(),
          },
        }));

      errorEl.hidden = true;
      addButton.disabled = true;
      addButton.textContent = "Adding…";

      try {
        const response = await fetch(
          (window.Shopify?.routes?.root || "/") + "cart/add.js",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ items }),
          },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.description || "One of the selected items is no longer available.");
        }
        document.dispatchEvent(
          new CustomEvent("bundlepilot:added-to-cart", { detail: { offerId: bundle.offerId } }),
        );
        window.location.href = (window.Shopify?.routes?.root || "/") + "cart";
      } catch (error) {
        errorEl.textContent =
          "We couldn't add this bundle to your cart. Please update your selection and try again. " +
          "(" + (error instanceof Error ? error.message : "Unknown error") + ")";
        errorEl.hidden = false;
        addButton.textContent = "Add bundle to cart";
        update();
      }
    });

    update();
    root.appendChild(container);
  }

  function renderEmptyState(root, message) {
    root.innerHTML = "";
    const p = document.createElement("p");
    p.className = "bundlepilot-mm__empty";
    p.textContent = message;
    root.appendChild(p);
  }

  function init(root) {
    let config;
    try {
      config = JSON.parse(root.dataset.config || "{}");
    } catch {
      config = {};
    }

    const keys = Object.keys(config);
    if (keys.length === 0) {
      renderEmptyState(root, "No active Mix & Match bundle yet. Create one in BundlePilot.");
      return;
    }

    const bundle = pickBundle(config, root.dataset.bundleId);
    if (!bundle) {
      renderEmptyState(
        root,
        "This store has multiple Mix & Match bundles — set \"Bundle ID\" in this block's settings to choose which one to show.",
      );
      return;
    }

    render(root, bundle, root.dataset.currency || "USD", root.dataset.showSavings === "true");
  }

  document.querySelectorAll("[data-bundlepilot-mix-match]").forEach(init);
})();
