"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const rfqNumber = params.get("rfq_number") || "";

  const formatDate = value => {
    if (!value) return "—";
    const d = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit" });
  };

  const formatQuantity = value =>
    new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value) || 0);

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };

  function imageFor(name) {
    // Reuse your product-images.js mappings first.
    const aliases = {
      "rubber sole": "vulcanized rubber outsoles",
      "shoe boxes (eco friendly)": "shoe boxes",
      "shoes adhesive": "shoe adhesive",
      "shoes adhesiv": "shoe adhesive"
    };
    const key = String(name || "").trim().toLowerCase();
    const resolver = window.resolveProcurementProductImage;
    return typeof resolver === "function"
      ? resolver(aliases[key] || key)
      : "";
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

  function renderSuppliers(suppliers, createdAt) {
    const body = $("supplierRows");
    body.replaceChildren();
    if (!suppliers.length) {
      const tr = el("tr");
      const td = el("td", "empty-suppliers", "No suppliers were selected for this RFQ.");
      td.colSpan = 4;
      tr.append(td);
      body.append(tr);
      return;
    }

    suppliers.forEach(supplier => {
      const tr = el("tr");
      const name = el("td", "", supplier.name || "—");
      const email = el("td", "", supplier.email || "Not provided");
      const date = el("td", "", formatDate(createdAt));
      const status = el("td");
      const hasQuotation = supplier.total_amount !== null;
      const chip = el(
        "span",
        `supplier-status ${hasQuotation ? "is-quoted" : "is-waiting"}`,
        hasQuotation ? "Quoted" : "Awaiting Quotation"
      );
      status.append(chip);
      tr.append(name, email, date, status);
      body.append(tr);
    });
  }

  async function load() {
    if (!rfqNumber) {
      $("pageStatus").textContent = "Missing RFQ number in the page URL.";
      $("pageStatus").classList.add("is-error");
      $("supplierRows").replaceChildren();
      return;
    }

    try {
      const response = await fetch(
        `../database/get-rfq-details.php?rfq_number=${encodeURIComponent(rfqNumber)}`,
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load RFQ details.");
      }

      const { rfq, items = [], suppliers = [], buyer = {} } = data;
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

      renderSuppliers(suppliers, rfq.created_at);

      const canEnter = ["open", "sent", "pending", "awaiting_quotation"].includes(
        String(rfq.status || "").toLowerCase()
      );
      const enter = $("enterQuotation");
      if (canEnter && suppliers.length) {
        enter.href = `enter-quotation.html?rfq_number=${encodeURIComponent(rfq.rfq_number)}`;
        enter.removeAttribute("aria-disabled");
        enter.classList.remove("is-disabled");
      } else {
        enter.removeAttribute("href");
        enter.setAttribute("aria-disabled", "true");
        enter.classList.add("is-disabled");
      }

      $("pageStatus").textContent =
        `RFQ status: ${rfq.status || "—"} · ${items.length} material(s) · ${suppliers.length} selected supplier(s)`;
    } catch (error) {
      console.error("RFQ Details error:", error);
      $("pageStatus").textContent = error.message;
      $("pageStatus").classList.add("is-error");
      $("itemCards").replaceChildren();
      $("supplierRows").replaceChildren();
    }
  }

  load();
})();
