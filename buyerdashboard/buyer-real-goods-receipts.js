/* UniProcur Figma-style REAL Inventory Goods Receipt viewer.
 * Local XAMPP, READ ONLY. The sample GR-0004 from Figma is not used as actual data.
 * Fetches recorded GRs and PO details, never updates stock, invoice or Finance.
 */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const poNumber = (params.get("po_number") || "").trim();
  const formatQty = value => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const peso = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
  const fmtDate = dateString => {
    if (!dateString) return "Not recorded";
    const d = new Date(String(dateString).slice(0, 10) + "T00:00:00");
    return Number.isNaN(d.getTime()) ? String(dateString) : d.toLocaleDateString("en-PH", { month: "long", day: "2-digit", year: "numeric" });
  };
  const fmtTime = dateString => dateString && String(dateString).length > 10 ? String(dateString).slice(11, 16) : "";
  const val = (value, fallback = "Not recorded") => value === null || value === undefined || String(value).trim() === "" ? fallback : String(value);
  const set = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const cell = (row, value) => { const el = document.createElement("td"); el.textContent = String(value); row.append(el); return el; };
  const showError = message => { $("loading").textContent = message; $("loading").classList.add("error"); $("content").hidden = true; $("printGr").disabled = true; };
  if (!/^PO-[A-Za-z0-9-]{1,26}$/.test(poNumber)) { showError("Missing or invalid Purchase Order number. Return to Purchase Orders and select View GR."); return; }
  const poLink = "buyer-view-purchase-order.html?po_number=" + encodeURIComponent(poNumber);
  $("backLink").href = poLink;
  $("closeLink").href = poLink;
  const get = async path => {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.message || "HTTP " + r.status);
    return d;
  };
  function renderTracking(po, real) {
    const status = String(po?.status || real.po?.po_status || "").toLowerCase();
    const fullyReceived = real.fully_received_from_real_gr === true;
    const hasActualReceipts = Array.isArray(real.receipts) && real.receipts.length > 0;
    const approved = ["approved", "issued", "partial", "received", "closed"].includes(status);
    const confirmed = !!po?.tracking_confirmed_at && approved;
    const seconds = Number(po?.tracking_elapsed_seconds || 0);
    let progress = approved ? 1 : 0;
    if (confirmed) progress = 2;
    if (confirmed && seconds >= 60) progress = 3;
    if (confirmed && seconds >= 120) progress = 4;
    if (fullyReceived) progress = 5;
    const steps = Array.from($("trackingSteps").querySelectorAll("li"));
    steps.forEach((step, index) => { step.classList.toggle("complete", index < progress); });
    $("trackingSteps").style.setProperty("--progress", (progress < 1 ? "0%" : Math.max(0, progress - 1) * 20 + "%"));
    set("stageIssued", approved ? fmtDate(po?.tracking_issued_at || po?.order_date) : "Pending approval");
    set("stageConfirmed", confirmed ? "Manager approved" : "Pending");
    set("stageTransit", confirmed && seconds >= 60 ? "Simulated" : "Pending");
    set("stageOut", confirmed && seconds >= 120 ? "Simulated" : "Pending");
    set("stageDelivery", fullyReceived ? "Inventory received" : hasActualReceipts ? "Partial receipt" : "Awaiting Inventory");
    set("trackingNote", fullyReceived
      ? "Delivery completed using posted Inventory Goods Receipts. Shipment milestones before receiving are classroom simulations."
      : hasActualReceipts
        ? "Inventory has posted a partial receipt. Final Delivery remains pending until all quantities are verified."
        : "No actual Goods Receipt found. In Transit and Out for Delivery are classroom simulation stages, not live supplier tracking.");
  }
  function render(real, poData) {
    if (real.po?.po_number !== poNumber) throw new Error("PO reference mismatch in Inventory Goods Receipts.");
    if (poData && poData.po?.po_number !== poNumber) throw new Error("PO reference mismatch in Procurement.");
    const po = poData?.po || {}, info = real.po || {};
    const receipts = Array.isArray(real.receipts) ? real.receipts : [];
    const items = Array.isArray(real.items) ? real.items : [];
    const fullyReceived = real.fully_received_from_real_gr === true;
    const mismatch = items.some(item => item.matches_real_receipts !== true);
    const mostRecent = receipts[0];
    const referenceLabel = receipts.length > 1 ? receipts.length + " Goods Receipts" : mostRecent ? mostRecent.goods_receipt_number : "Awaiting Receipt";
    set("headerReference", poNumber);
    set("grReference", referenceLabel);
    set("receiptStatus", fullyReceived ? "Received" : mismatch ? "Needs Verification" : receipts.length ? "Partially Received" : "Pending Receipt");
    set("poNumber", poNumber);
    set("rfqNumber", val(po.rfq_number));
    set("orderDate", fmtDate(po.order_date));
    set("deliveryDate", fmtDate(po.expected_delivery));
    set("paymentTerms", val(po.payment_terms));
    set("totalValue", po.total_amount === undefined || po.total_amount === null ? "Not recorded" : peso(po.total_amount));
    set("supplierName", val(info.supplier_name || po.supplier_name));
    set("prNumber", val(info.pr_number));
    set("priority", "Not recorded"); // Priority is not supplied by either read-only endpoint.
    set("deliveryAddress", val(po.delivery_address));
    const warehouses = [...new Set(receipts.map(r => String(r.warehouse_name || "").trim()).filter(Boolean))];
    set("receiptWarehouse", warehouses.length ? warehouses.join(" / ") : "No receipt warehouse recorded");
    set("receivingClerk", "Not recorded in Inventory receipt data");
    const rowItems = $("itemRows"); rowItems.replaceChildren();
    items.forEach((item, i) => {
      const tr = document.createElement("tr");
      cell(tr, i + 1); cell(tr, val(item.item_name, "—")); cell(tr, val(item.inventory_item_code, "Not mapped"));
      cell(tr, formatQty(item.qty_ordered) + " " + val(item.unit, "").trim());
      const actual = cell(tr, formatQty(item.real_accepted) + " " + val(item.unit, "").trim());
      if (!item.matches_real_receipts) actual.title = "GR accepted quantity does not match Procurement PO received quantity";
      rowItems.append(tr);
    });
    if (!items.length) { const tr = document.createElement("tr"); const td = cell(tr, "No PO items returned by Inventory."); td.colSpan = 5; rowItems.append(tr); }
    const rowReceipts = $("receiptRows"); rowReceipts.replaceChildren();
    receipts.forEach(r => {
      const tr = document.createElement("tr");
      [val(r.goods_receipt_number, "—"), fmtDate(r.received_date), val(r.warehouse_name, "—"), formatQty(r.delivered), formatQty(r.accepted), formatQty(r.rejected)].forEach(v => cell(tr, v));
      if (r.posted_at) tr.title = "Posted: " + r.posted_at + (fmtTime(r.posted_at) ? "" : "");
      rowReceipts.append(tr);
    });
    if (!receipts.length) { const tr = document.createElement("tr"); const td = cell(tr, "No real Inventory GR has been posted for this PO."); td.colSpan = 6; rowReceipts.append(tr); }
    set("receiptCount", receipts.length + (receipts.length === 1 ? " receipt" : " receipts"));
    const verify = $("verificationResult");
    verify.className = "receipt-verification " + (fullyReceived ? "good" : mismatch ? "bad" : "");
    verify.textContent = fullyReceived ? "✓ Fully received. PO quantities match posted real Inventory Goods Receipts. Invoice matching is the next separate step."
      : mismatch ? "⚠ Inventory and Procurement received quantities do not reconcile. Investigate before invoice verification."
        : receipts.length ? "Partial delivery recorded. Awaiting remaining materials; invoice matching needs separate verification."
          : "Awaiting Inventory Goods Receiving. Do not assume delivery from PO status alone.";
    renderTracking(po, real);
    if (poData?.buyer) {
      set("buyerName", val(poData.buyer.full_name, "Buyer"));
      set("buyerEmail", val(poData.buyer.email, ""));
      set("buyerAvatar", String(poData.buyer.full_name || "B").trim().charAt(0).toUpperCase() || "B");
    }
    $("loading").hidden = true;
    $("content").hidden = false;
    $("printGr").disabled = false;
    document.title = "UniProcur | GR · " + poNumber;
  }
  $("printGr").addEventListener("click", () => window.print());
  (async () => {
    try {
      const r = await get("../database/get-buyer-real-goods-receipts.php?po_number=" + encodeURIComponent(poNumber));
      let p = null;
      try { p = await get("../database/get-buyer-purchase-orders.php?po_number=" + encodeURIComponent(poNumber)); }
      catch (e) { console.warn("PO details not available; rendering actual Inventory GRs only:", e); }
      render(r, p);
    } catch (e) {
      showError("Unable to verify actual Inventory Goods Receipts: " + (e.message || "connection error") + ". Local XAMPP Inventory database and read-only GR endpoint are required.");
      console.error("Figma Goods Receipt viewer:", e);
    }
  })();
})();
