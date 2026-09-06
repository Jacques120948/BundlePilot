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

  function isGrouped(bundle) {
    return Array.isArray(bundle.groups) && bundle.groups.length > 0;
  }

  function allProducts(bundle) {
    return isGrouped(bundle) ? bundle.groups.flatMap((g) => g.products) : bundle.products;
  }

  function groupItemCount(selections, group) {
    return group.products.reduce((sum, p) => sum + (selections.get(p.variantId) || 0), 0);
  }

  /**
   * A required group must land inside its own min/max; an optional group
   * left untouched (0 items) is fine, but once the customer starts filling
   * it, it must still respect its own range — mirrors the Cart Transform
   * function's own per-group check (extensions/mix-match-cart-transform),
   * so this preview can't promise a bundle that checkout would reject.
   */
  function isGroupSatisfied(selections, group) {
    const count = groupItemCount(selections, group);
    if (group.required) return count >= group.minSelections && count <= group.maxSelections;
    return count === 0 || (count >= group.minSelections && count <= group.maxSelections);
  }

  function computeSummary(bundle, selections, products) {
    let regular = 0;
    let totalItems = 0;
    for (const product of products) {
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

    const isComplete =
      isGrouped(bundle)
        ? bundle.groups.every((g) => isGroupSatisfied(selections, g))
        : totalItems >= bundle.minItems && totalItems <= bundle.maxItems;

    return {
      totalItems,
      regular,
      bundlePrice,
      savings: regular - bundlePrice,
      isComplete,
    };
  }

  function renderFlat(root, bundle, currency, showSavings) {
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
      const summaryData = computeSummary(bundle, selections, bundle.products);

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
      grid.appendChild(
        createProductCard(product, currency, bundle.allowDuplicates, selections, update),
      );
    });

    addButton.addEventListener("click", () => {
      submitAddToCart(bundle.offerId, bundle.products, selections, addButton, errorEl, update);
    });

    update();
    root.appendChild(container);
  }

  /** Renders one product's stepper (allowDuplicates) or checkbox (else) card. */
  function createProductCard(product, currency, allowDuplicates, selections, onChange) {
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

    if (allowDuplicates) {
      const stepper = document.createElement("div");
      stepper.className = "bundlepilot-mm__stepper";

      const decrement = document.createElement("button");
      decrement.type = "button";
      decrement.textContent = "−";
      decrement.setAttribute("aria-label", `Remove one ${product.title}`);

      const countEl = document.createElement("span");
      countEl.textContent = String(selections.get(product.variantId) || 0);
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
        onChange();
      });
      increment.addEventListener("click", () => {
        const current = selections.get(product.variantId) || 0;
        selections.set(product.variantId, current + 1);
        countEl.textContent = String(current + 1);
        onChange();
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
      checkbox.checked = (selections.get(product.variantId) || 0) > 0;

      checkbox.addEventListener("change", () => {
        selections.set(product.variantId, checkbox.checked ? 1 : 0);
        onChange();
      });

      const labelText = document.createElement("span");
      labelText.textContent = "Select";

      label.append(checkbox, labelText);
      card.appendChild(label);
    }

    return card;
  }

  /** Shared "Add bundle to cart" flow for both the flat and grouped renderers. */
  async function submitAddToCart(offerId, products, selections, addButton, errorEl, onSettled) {
    const items = products
      .filter((p) => (selections.get(p.variantId) || 0) > 0)
      .map((p) => ({
        id: Number(p.variantId.split("/").pop()),
        quantity: selections.get(p.variantId),
        properties: {
          _bp_offer: offerId,
          _bp_session: generateSessionId(),
        },
      }));

    errorEl.hidden = true;
    addButton.disabled = true;
    addButton.textContent = "Adding…";

    try {
      const response = await fetch((window.Shopify?.routes?.root || "/") + "cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.description || "One of the selected items is no longer available.");
      }
      document.dispatchEvent(
        new CustomEvent("bundlepilot:added-to-cart", { detail: { offerId } }),
      );
      window.location.href = (window.Shopify?.routes?.root || "/") + "cart";
    } catch (error) {
      errorEl.textContent =
        "We couldn't add this bundle to your cart. Please update your selection and try again. " +
        "(" + (error instanceof Error ? error.message : "Unknown error") + ")";
      errorEl.hidden = false;
      addButton.textContent = "Add bundle to cart";
      onSettled();
    }
  }

  /**
   * Step-by-step flow for a Grouped Mix & Match bundle: one screen per
   * BundleGroup, then a final summary screen with the full price preview
   * and "Add bundle to cart" — see docs/THEME_EXTENSION.md "Mix & Match
   * block". Selections persist across steps (one shared Map for the whole
   * bundle), so navigating back and forth never loses a prior choice.
   */
  function renderGrouped(root, bundle, currency, showSavings) {
    const selections = new Map();
    const products = allProducts(bundle);
    // 0..groups.length-1 are group steps; groups.length is the summary screen.
    let step = 0;

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

    const body = document.createElement("div");
    container.appendChild(body);

    const errorEl = document.createElement("p");
    errorEl.className = "bundlepilot-mm__error";
    errorEl.hidden = true;
    container.appendChild(errorEl);

    function renderGroupStep(group, index) {
      body.innerHTML = "";
      progress.textContent =
        `Step ${index + 1} of ${bundle.groups.length}: ${group.name}` +
        (group.required ? "" : " (optional)");

      if (group.description) {
        const desc = document.createElement("p");
        desc.className = "bundlepilot-mm__description";
        desc.textContent = group.description;
        body.appendChild(desc);
      }

      const rangeLabel = document.createElement("p");
      rangeLabel.className = "bundlepilot-mm__progress";
      rangeLabel.textContent =
        group.minSelections === group.maxSelections
          ? `Choose ${group.maxSelections}`
          : `Choose ${group.minSelections}–${group.maxSelections}`;
      body.appendChild(rangeLabel);

      const grid = document.createElement("div");
      grid.className = "bundlepilot-mm__grid";
      body.appendChild(grid);

      function updateStep() {
        const count = groupItemCount(selections, group);
        grid.querySelectorAll("[data-bundlepilot-increment]").forEach((btn) => {
          btn.disabled = count >= group.maxSelections;
        });
        grid.querySelectorAll("[data-bundlepilot-checkbox]").forEach((input) => {
          if (!selections.get(input.dataset.variantId)) {
            input.disabled = count >= group.maxSelections;
          }
        });
        nextButton.disabled = !isGroupSatisfied(selections, group);
      }

      group.products.forEach((product) => {
        grid.appendChild(
          createProductCard(product, currency, group.allowDuplicates, selections, updateStep),
        );
      });

      const nav = document.createElement("div");
      nav.className = "bundlepilot-mm__stepnav";

      const backButton = document.createElement("button");
      backButton.type = "button";
      backButton.className = "bundlepilot-mm__back";
      backButton.textContent = "Back";
      backButton.disabled = index === 0;
      backButton.addEventListener("click", () => goToStep(index - 1));

      const nextButton = document.createElement("button");
      nextButton.type = "button";
      nextButton.className = "bundlepilot-mm__add";
      nextButton.textContent = index === bundle.groups.length - 1 ? "Review bundle" : "Next";
      nextButton.addEventListener("click", () => goToStep(index + 1));

      nav.append(backButton, nextButton);
      body.appendChild(nav);

      updateStep();
    }

    function renderSummaryStep() {
      body.innerHTML = "";
      progress.textContent = "Review your bundle";

      bundle.groups.forEach((group) => {
        const chosen = group.products.filter((p) => (selections.get(p.variantId) || 0) > 0);
        if (chosen.length === 0) return;

        const groupHeading = document.createElement("p");
        groupHeading.className = "bundlepilot-mm__card-title";
        groupHeading.textContent = group.name;
        body.appendChild(groupHeading);

        const list = document.createElement("p");
        list.className = "bundlepilot-mm__description";
        list.textContent = chosen
          .map((p) => {
            const qty = selections.get(p.variantId);
            return qty > 1 ? `${p.title} ×${qty}` : p.title;
          })
          .join(", ");
        body.appendChild(list);
      });

      const summary = document.createElement("div");
      summary.className = "bundlepilot-mm__summary";
      body.appendChild(summary);

      const summaryData = computeSummary(bundle, selections, products);
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

      if (summaryData.isComplete) {
        const badge = document.createElement("p");
        badge.className = "bundlepilot-mm__complete";
        badge.textContent = "Bundle complete ✓";
        body.appendChild(badge);
      }

      const nav = document.createElement("div");
      nav.className = "bundlepilot-mm__stepnav";

      const backButton = document.createElement("button");
      backButton.type = "button";
      backButton.className = "bundlepilot-mm__back";
      backButton.textContent = "Back";
      backButton.addEventListener("click", () => goToStep(bundle.groups.length - 1));
      nav.appendChild(backButton);
      body.appendChild(nav);

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "bundlepilot-mm__add";
      addButton.textContent = "Add bundle to cart";
      addButton.disabled = !summaryData.isComplete;
      addButton.addEventListener("click", () => {
        submitAddToCart(bundle.offerId, products, selections, addButton, errorEl, renderSummaryStep);
      });
      body.appendChild(addButton);
    }

    function goToStep(index) {
      step = index;
      errorEl.hidden = true;
      if (step >= bundle.groups.length) {
        renderSummaryStep();
      } else {
        renderGroupStep(bundle.groups[step], step);
      }
    }

    goToStep(step);
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

    const currency = root.dataset.currency || "USD";
    const showSavings = root.dataset.showSavings === "true";
    if (isGrouped(bundle)) {
      renderGrouped(root, bundle, currency, showSavings);
    } else {
      renderFlat(root, bundle, currency, showSavings);
    }
  }

  document.querySelectorAll("[data-bundlepilot-mix-match]").forEach(init);
})();
