"use strict";

// Enter Quotation — visual + draft simulation stage.
// Reads real RFQ, items and selected suppliers from existing MySQL endpoint.
// Demo rates below are illustrative, NOT actual supplier responses and NOT saved.
(() => {
  const byId = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const rfqNumber = params.get("rfq_number");
  const money = (amount) => new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2
  }).format(amount);

  const supplierVisuals = [
    { match: "marikina", file: "marikina.svg", short: "marikina" },
    { match: "cordillera", file: "cordillera.svg", short: "cordillera" },
    { match: "synthhide", file: "synthide.svg", short: "synthhide" },
    { match: "soletech", file: "soletech.svg", short: "soletech" },
    { match: "ecobox", file: "ecobox.svg", short: "ecobox" },
    { match: "metalcraft", file: "metalcraft.svg", short: "metalcraft" }
  ];

  // Read-only catalog price preview. Values mirror the static fallback prices
  // currently displayed by supplier/catalog.js when its PHP catalog is unavailable.
  // They are NOT actual quotations and are NOT saved by this preview page.
  
const catalogProducts = [
    "full-grain leather",
    "black leather",
    "nubuck leather",
    "mesh fabric",
    "canvas fabric",
    "pu leather",
    "rubber sole",
    "eva foam sheets",
    "foam insole",
    "metal eyelets",
    "metal buckles",
    "shoelaces",
    "shoe boxes (eco friendly)",
    "tissue paper rolls",
    "packaging tape",
    "shoes adhesiv"
];

  const catalogRates = {
    marikina:   [240,235,260,128,97,148,510,128,318,82,35,26,12.5,0.86,46,152],
    cordillera: [
    235, 250, 252, 130,
    98, 152, 515, 130,
    322, 85, 36, 27,
    13, 0.88, 48, 155
],
    synthhide:  [245,240,258,125,95,145,508,126,316,81,34.5,25.5,12.3,0.85,45.5,151],
    soletech:   [242,238,262,127,96,149,505,125,320,83,35.5,26.5,12.4,0.86,46.5,150],
    metalcraft: [244,245,264,129,97,147,512,128,315,80,34.5,25.5,12.6,0.86,46,152],
    ecobox:     [242,238,262,127,96,149,505,125,320,83,35.5,26.5,12.4,0.86,46.5,150]
  };
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function supplierKey(name) {
    const normalized = normalize(name).replace(/\s/g, "");
    return supplierVisuals.find((v) => normalized.includes(v.match)) || null;
  }
  function catalogPrice(supplier, item) {
    const key = supplierKey(supplier.name)?.short;
    const index = catalogProducts.findIndex((name) => normalize(name) === normalize(item.item_name));
    if (key && index !== -1 && catalogRates[key]) return catalogRates[key][index];
    // Other catalog products may exist in MySQL but not in the visual fallback list.
    if (item.unit_price !== null && item.unit_price !== undefined && item.unit_price !== "" &&
        Number.isFinite(Number(item.unit_price)) && Number(item.unit_price) >= 0) {
      return Number(item.unit_price);
    }
    return null;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }
  function makeReadOnlyInput(value) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = String(value);
    input.readOnly = true;
    input.tabIndex = -1;
    return input;
  }

  function createItem(item, supplier, onPriceChange) {
    const card = makeElement("article", "item-box");
    card.appendChild(makeElement("h3", "", item.item_name));
    const quantity = Number(item.quantity);
    const itemUnit = item.unit || "unit";

    const quantityLine = makeElement("div", "item-form-row");
    const quantityLabel = makeElement("label", "", "Quantity:");
    const quantityDisplay = makeReadOnlyInput(Number.isFinite(quantity) ? quantity.toString() : "0");
    const quantityWrap = makeElement("div", "input-wrap");
    quantityWrap.append(quantityDisplay);
    const quantityUnit = makeElement("span", "item-unit", itemUnit);
    quantityLine.append(quantityLabel, quantityWrap, quantityUnit);

    const priceLine = makeElement("div", "item-form-row");
    const priceLabel = makeElement("label", "", "Unit Price:");
    const priceWrap = makeElement("div", "input-wrap");
    priceWrap.appendChild(makeElement("span", "peso-prefix", "₱"));
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.className = "price-input";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.inputMode = "decimal";
    priceInput.setAttribute("aria-label", `${supplier.name}: unit price for ${item.item_name}`);
    const initialRate = catalogPrice(supplier, item);
    if (initialRate !== null) priceInput.value = initialRate.toFixed(2);
    else priceInput.placeholder = "Not in catalog";
    priceInput.readOnly = true;
    priceInput.title = initialRate === null ? "No matching supplier catalog price" : "Automatically loaded from the Suppliers catalog";
    priceWrap.appendChild(priceInput);
    const priceUnit = makeElement("span", "item-unit", itemUnit);
    priceLine.append(priceLabel, priceWrap, priceUnit);

    card.append(quantityLine, priceLine);
    return { card, priceInput, quantity };
  }

  function createSideField(labelText, value, multiline = false) {
    const line = makeElement("div", "side-field");
    const label = makeElement("label", "", labelText);
    const input = multiline ? document.createElement("textarea") : document.createElement("input");
    if (!multiline) input.type = "text";
    input.value = value || "";
    label.htmlFor = `${labelText.toLowerCase().replace(/\W/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    input.id = label.htmlFor;
    if (labelText === "Lead Time:" || labelText === "Payment:") input.readOnly = true;
    line.append(label, input);
    return line;
  }

  function defaultRemarks(name) {
    const key = supplierKey(name)?.short;
    if (key === "marikina") return "Includes free delivery";
    if (key === "synthhide") return "Free delivery";
    return "None";
  }

  function renderSupplier(supplier) {
    const row = makeElement("section", "supplier-row");
    const photoSide = makeElement("div", "supplier-visual");
    const visual = supplierKey(supplier.name);
    if (visual) photoSide.style.backgroundImage = `url("../assets/${visual.file}")`;
    photoSide.appendChild(makeElement("h2", "supplier-name", supplier.name));
    const grid = makeElement("div", "item-grid");
    const aside = makeElement("aside", "quotation-side");
    const leadTime = supplier.lead_time_days ? `${supplier.lead_time_days} days` : "—";
    aside.append(
      createSideField("Lead Time:", leadTime),
      createSideField("Payment:", supplier.payment_terms || "—"),
      createSideField("Remarks:", defaultRemarks(supplier.name), true)
    );
    aside.appendChild(makeElement("div", "side-spacer"));
    const totalRow = makeElement("div", "side-total");
    totalRow.appendChild(makeElement("span", "", "Total:"));
    const output = makeElement("output", "", "₱0.00");
    output.setAttribute("aria-live", "polite");
    totalRow.append(output);
    aside.append(totalRow);

    const orderedItems = [...(supplier.items || [])].sort((a, b) => {
      const rank = { "nubuck leather": 0, "canvas fabric": 1, "pu leather": 2 };
      return (rank[normalize(a.item_name)] ?? 10) - (rank[normalize(b.item_name)] ?? 10);
    });
    const draftLines = [];
    function updateTotal() {
      let total = 0;
      let missing = false;
      for (const line of draftLines) {
        const rate = line.priceInput.value.trim() === "" ? NaN : Number(line.priceInput.value);
        if (!Number.isFinite(rate) || rate < 0) missing = true;
        else total += rate * line.quantity;
      }
      output.textContent = missing ? "Incomplete" : money(total);
    }
    for (const item of orderedItems) {
      const line = createItem(item, supplier, updateTotal);
      draftLines.push(line);
      grid.append(line.card);
    }
    updateTotal();
    photoSide.append(grid);
    row.append(photoSide, aside);
    return row;
  }

  async function load() {
    const status = byId("message");
    if (!rfqNumber) { status.textContent = "RFQ number is missing from the URL."; status.classList.add("is-error"); return; }
    try {
      const response = await fetch(`../database/get-rfq-quotation-data.php?rfq_number=${encodeURIComponent(rfqNumber)}`, {
        credentials: "same-origin", headers: { Accept: "application/json" }
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load RFQ.");
      const { rfq, suppliers } = data;
      byId("headerTitle").textContent = rfq.rfq_number;
      byId("rfqSmallNumber").textContent = rfq.rfq_number;
      document.title = `RFQ Details | ${rfq.rfq_number}`;

      const names = suppliers[0]?.items?.map((item) => item.item_name) || [];
      byId("rfqHeading").textContent = names.length ? names.join(" + ") : `Quotation for ${rfq.pr_number}`;
      const list = byId("supplierList");
      list.replaceChildren();
      suppliers.forEach((supplier) => list.appendChild(renderSupplier(supplier)));
      status.textContent = suppliers.length === 0 ? "No selected suppliers found for this RFQ." : "";
      byId("draftNotice").hidden = suppliers.length === 0;
    } catch (error) {
      console.error("Enter quotation load error:", error);
      status.textContent = error.message;
      status.classList.add("is-error");
    }
  }
  load();
})();
