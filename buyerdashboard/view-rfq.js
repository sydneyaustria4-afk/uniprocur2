"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const rfqNumber = new URLSearchParams(location.search).get("rfq_number") || "";
  let rfqInfo = null;
  let suppliers = [];
  let pollTimer = null;
  let checking = false;

  const formatDate = value => {
    if (!value) return "—";
    const d = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? String(value) :
      d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit" });
  };
  const formatQuantity = value =>
    new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const el = (tag, className = "", text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };

  function imageFor(name) {
    const aliases = {
      "rubber sole": "vulcanized rubber outsoles",
      "shoe boxes (eco friendly)": "shoe boxes",
      "shoes adhesive": "shoe adhesive",
      "shoes adhesiv": "shoe adhesive"
    };
    const key = String(name || "").trim().toLowerCase();
    const resolver = window.resolveProcurementProductImage;
    return typeof resolver === "function" ? resolver(aliases[key] || key) : "";
  }

  function materialCard(item) {
    const card = el("article", "item-card");
    const media = el("div", "item-media");
    const imagePath = imageFor(item.item_name);
    if (imagePath) {
      const img = el("img", "material-image");
      img.src = imagePath;
      img.alt = String(item.item_name || "Material");
      img.loading = "lazy";
      img.addEventListener("error", () => {
        media.replaceChildren(el("span", "image-placeholder", "Image unavailable"));
      });
      media.append(img);
    } else {
      media.append(el("span", "image-placeholder", "No image"));
    }
    const info = el("div", "item-info");
    info.append(el("h3", "item-title", item.item_name || "Material"));
    const qtyRow = el("div", "item-field");
    qtyRow.append(el("span", "field-label", "Quantity:"));
    const qtyFields = el("div", "quantity-fields");
    qtyFields.append(
      el("span", "read-field", formatQuantity(item.qty)),
      el("span", "read-field unit", item.unit || "—")
    );
    qtyRow.append(qtyFields);
    const descRow = el("div", "item-field description-row");
    descRow.append(el("span", "field-label", "Description:"));
    descRow.append(el("div", "read-field description-box", item.description || "—"));
    info.append(qtyRow, descRow);
    card.append(media, info);
    return card;
  }

  function renderSuppliers(latestStatuses = []) {
    const body = $("supplierRows");
    body.replaceChildren();
    if (!suppliers.length) {
      const row = el("tr");
      const cell = el("td", "empty-suppliers", "No suppliers selected for this RFQ.");
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
      return;
    }
    const statuses = new Map(latestStatuses.map(s => [Number(s.quote_id), s]));
    suppliers.forEach(supplier => {
      const row = el("tr");
      const state = statuses.get(Number(supplier.quote_id));
      const statusLabel = state?.status || "Pending";
      const quoted = statusLabel === "Quoted";
      const status = el("td");
      const chip = el(
        "span",
        `supplier-status ${quoted ? "is-quoted" : "is-waiting"}`,
        statusLabel
      );
      if (state?.simulated) chip.title = "Demo quotation ready; not saved until Save and Compare";
      status.append(chip);
      row.append(
        el("td", "", supplier.name || "—"),
        el("td", "", supplier.email || "Not provided"),
        el("td", "", formatDate(rfqInfo?.created_at)),
        status
      );
      body.append(row);
    });
  }

  function setEnterEnabled(enabled) {
    const enter = $("enterQuotation");
    if (enabled) {
      enter.href = `enter-quotation.html?rfq_number=${encodeURIComponent(rfqNumber)}`;
      enter.removeAttribute("aria-disabled");
      enter.classList.remove("is-disabled");
      enter.title = "Review the simulated supplier quotations";
    } else {
      enter.removeAttribute("href");
      enter.setAttribute("aria-disabled", "true");
      enter.classList.add("is-disabled");
      enter.title = "Available once all selected suppliers are Quoted";
    }
  }

  async function refreshQuotationStatus() {
    if (checking || !rfqInfo) return;
    checking = true;
    try {
      const response = await fetch(
        `../database/get-rfq-demo-status.php?rfq_number=${encodeURIComponent(rfqNumber)}`,
        { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }
      );
      const state = await response.json();
      if (!response.ok || !state.success) {
        throw new Error(state.message || "Unable to check quotation status.");
      }
      renderSuppliers(state.suppliers || []);
      setEnterEnabled(state.can_enter_quotation === true);
      const open = state.rfq_status === "open";
      if (!open) {
        $("pageStatus").textContent = `RFQ status: ${state.rfq_status}. Quotations are already processed or the RFQ is closed.`;
        clearInterval(pollTimer);
      } else if (state.can_enter_quotation) {
        $("pageStatus").textContent =
          `All ${state.total_suppliers} demo supplier quotation(s) are Quoted. You can now review them using Enter Quotation.`;
        clearInterval(pollTimer);
      } else {
        $("pageStatus").textContent =
          `Waiting for demo quotations: ${state.ready_count}/${state.total_suppliers} Quoted` +
          (state.seconds_remaining > 0 ? ` · approximately ${state.seconds_remaining}s remaining` : "") + ".";
      }
      $("pageStatus").classList.remove("is-error");
    } catch (error) {
      setEnterEnabled(false);
      $("pageStatus").textContent = error.message;
      $("pageStatus").classList.add("is-error");
      console.error("RFQ demo status error:", error);
    } finally {
      checking = false;
    }
  }

  async function load() {
    setEnterEnabled(false);
    if (!rfqNumber) {
      $("pageStatus").textContent = "Missing RFQ number in the page URL.";
      $("pageStatus").classList.add("is-error");
      return;
    }
    try {
      const response = await fetch(
        `../database/get-rfq-details.php?rfq_number=${encodeURIComponent(rfqNumber)}`,
        { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load RFQ details.");
      }
      const { rfq, items = [], buyer = {} } = data;
      rfqInfo = rfq;
      suppliers = data.suppliers || [];
      $("headerNumber").textContent = rfq.rfq_number;
      $("rfqNumber").textContent = rfq.rfq_number;
      $("createdDate").textContent = formatDate(rfq.created_at);
      $("dueDate").textContent = formatDate(rfq.deadline);
      $("prNumber").textContent = rfq.pr_number || "—";
      $("buyerName").textContent = buyer.full_name || "Buyer";
      $("buyerEmail").textContent = buyer.email || "—";
      $("buyerInitial").textContent = (buyer.full_name || "B").trim().charAt(0).toUpperCase();

      const cards = $("itemCards");
      cards.replaceChildren();
      if (items.length) items.forEach(item => cards.append(materialCard(item)));
      else cards.append(el("p", "empty-items", "No materials found for this RFQ."));

      renderSuppliers();
      await refreshQuotationStatus();
      // Poll while waiting; a new RFQ transitions from Pending to Quoted after seconds.
      if (!pollTimer && rfqInfo && String(rfqInfo.status).toLowerCase() === "open" &&
          $("enterQuotation").getAttribute("aria-disabled") === "true") {
        pollTimer = setInterval(refreshQuotationStatus, 1500);
      }
    } catch (error) {
      console.error("RFQ Details error:", error);
      $("pageStatus").textContent = error.message;
      $("pageStatus").classList.add("is-error");
      $("itemCards").replaceChildren();
      $("supplierRows").replaceChildren();
    }
  }

  window.addEventListener("pagehide", () => clearInterval(pollTimer));
  load();
})();
