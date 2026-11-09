"use strict";

/*
 * UniProcur - live Print PO (read only)
 * Uses the EXACT SAME working PHP endpoint as buyer-view-purchase-order.js.
 * Source: database/get-buyer-purchase-orders.php?po_number=PO-2026-0002
 * The endpoint already verifies the Buyer's session and PO ownership.
 * No database writes and no dependency on po-print.php.
 */
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const poNumber = (params.get("po_number") || "").trim();
  const endpoint = "../database/get-buyer-purchase-orders.php";
  const money = value => new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const quantity = value => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(number(value));
  const formatDate = value => {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? "—" : date.toLocaleDateString("en-PH", { month: "long", day: "2-digit", year: "numeric" });
  };
  const present = value => {
    const text = String(value ?? "").trim();
    return !text || ["not provided", "null", "n/a", "—"].includes(text.toLowerCase()) ? "Not provided" : text;
  };
  const set = (id, value) => { $(id).textContent = value == null || value === "" ? "—" : String(value); };

  // Mirrors the dynamic tracking label from the existing Buyer PO page.
  // The Print screen does NOT alter approval, tracking, inventory, or Goods Receipts.
  function statusForDisplay(po) {
    const status = String(po.status || "").toLowerCase();
    if (["draft", "pending_approval", "rejected"].includes(status)) {
      return { draft: "Draft", pending_approval: "Pending Approval", rejected: "Rejected" }[status];
    }
    if (po.tracking_inventory_accepted_at || ["received", "closed"].includes(status)) {
      return po.tracking_accept_source === "local_demo" ? "Delivered (Demo)" : "Delivered";
    }
    if (po.tracking_confirmed_at) {
      const seconds = Math.max(0, number(po.tracking_elapsed_seconds));
      if (seconds >= 120) return "Out for Delivery";
      if (seconds >= 60) return "In Transit";
      return "In Production";
    }
    return {
      approved: "In Production", issued: "In Transit", partial: "Partially Received"
    }[status] || status || "—";
  }

  function fillItems(items) {
    const body = $("poItems");
    body.replaceChildren();
    if (!items.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "No ordered items found.";
      row.append(cell);
      body.append(row);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("tr");
      const fields = [
        index + 1,
        present(item.item_name),
        `${quantity(item.qty_ordered)} ${item.unit || ""}`.trim(),
        money(item.unit_price),
        money(item.subtotal == null ? number(item.qty_ordered) * number(item.unit_price) : item.subtotal)
      ];
      fields.forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      });
      body.append(row);
    });
  }

  function render(data) {
    const po = data.po;
    const items = Array.isArray(data.items) ? data.items : [];
    const buyer = data.buyer || {};
    if (!po || !po.po_number) throw new Error("The server did not return a Purchase Order.");

    // Security/mismatch guard: never print another PO when the requested code differs.
    if (po.po_number !== poNumber) throw new Error("The returned PO number does not match the requested record.");

    set("headerPoNumber", po.po_number);
    set("poNumber", po.po_number);
    set("rfqNumber", present(po.rfq_number));
    set("orderDate", formatDate(po.order_date));
    set("expectedDate", formatDate(po.expected_delivery));
    set("paymentTerms", present(po.payment_terms));
    set("supplierName", present(po.supplier_name));
    set("supplierContact", present(po.supplier_contact));
    set("supplierEmail", present(po.supplier_email));
    set("supplierPhone", present(po.supplier_phone));
    set("supplierLocation", present(po.supplier_location));

    const status = statusForDisplay(po);
    set("poStatus", status);
    $("poStatus").dataset.status = String(status).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    fillItems(items);

    // This application's existing PO details use total_amount as the saved net PO amount.
    // The displayed 12% VAT is ONLY an estimate, not a confirmed tax from MySQL.
    const savedNet = po.total_amount != null
      ? number(po.total_amount)
      : items.reduce((sum, item) => sum + number(item.subtotal), 0);
    const vatEstimate = Math.round(savedNet * 0.12 * 100) / 100;
    const estimateWithVAT = savedNet + vatEstimate;
    set("subtotal", money(savedNet));
    set("vatRate", "12");
    set("vat", money(vatEstimate));
    set("total", money(estimateWithVAT));
    set("paymentTermsShort", present(po.payment_terms));
    set("paymentSubtotal", money(savedNet));
    set("paymentVat", money(vatEstimate));
    set("paymentTotal", money(estimateWithVAT));

    // The current API has delivery_address but no receiving_clerk or verified map URL.
    set("deliveryAddress", present(po.delivery_address));
    set("receivingClerk", "Not recorded");
    $("deliveryMap").hidden = true;
    $("mapFallback").hidden = false;

    set("userFullName", present(buyer.full_name));
    set("userEmail", present(buyer.email));
    document.title = `UniProcur | Print ${po.po_number}`;
    $("printButton").disabled = false;
  }

  async function load() {
    if (!/^PO-[A-Za-z0-9-]{1,26}$/.test(poNumber)) {
      showError("Missing or invalid PO number. Return to Buyer Purchase Orders and open a PO.");
      return;
    }
    try {
      const url = new URL(endpoint, location.href);
      url.searchParams.set("po_number", poNumber);
      const response = await fetch(url, {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
      });
      let result;
      try { result = await response.json(); }
      catch { throw new Error(`The PO API did not return JSON (HTTP ${response.status}). Check Buyer login.`); }
      if (!response.ok || !result.success) throw new Error(result.message || `PO API failed (HTTP ${response.status}).`);
      render(result);
    } catch (error) {
      console.error("Print PO:", error);
      showError(error.message || "Unable to load live PO data.");
    }
  }

  function showError(message) {
    $("errorMessage").textContent = message;
    $("errorMessage").hidden = false;
    $("printButton").disabled = true;
    $("poItems").replaceChildren();
  }

  $("goBack").addEventListener("click", () => {
    location.href = `buyer-view-purchase-order.html?po_number=${encodeURIComponent(poNumber)}`;
  });
 

$("printButton").addEventListener("click", () => {
  window.print();
});


  load();
})();
