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
  // UNIPROCUR_EVENT_BASED_TRACKING_V2: Actual Goods Receipts are the ONLY
  // evidence of a received delivery here. Supplier shipment events are unknown.
  function renderTracking(po, real) {
    const status = String(po?.status || real.po?.po_status || "").toLowerCase();
    const fullyReceived = real.fully_received_from_real_gr === true;
    const hasActualReceipts = Array.isArray(real.receipts) && real.receipts.length > 0;
    const managerApproved = ["approved", "issued", "partial", "received", "closed"].includes(status);
    const steps = Array.from($("trackingSteps").querySelectorAll("li"));
    steps.forEach((step, index) => {
      step.classList.toggle("complete", index === 0 && managerApproved);
      step.classList.toggle("has-receipt", index === 4 && hasActualReceipts);
    });
    $("trackingSteps").style.setProperty("--progress", "0%");
    if (steps[0]) steps[0].querySelector("strong").textContent = "Manager Approved";
    if (steps[1]) steps[1].querySelector("strong").textContent = "Supplier Confirmed";
    set("stageIssued", managerApproved ? "Approved in PO records" : "Pending approval");
    set("stageConfirmed", "Not reported");
    set("stageTransit", "Not reported");
    set("stageOut", "Not reported");
    set("stageDelivery", fullyReceived ? "Inventory received" : hasActualReceipts ? "Partial receipt" : "Awaiting Inventory");
    set("trackingNote", fullyReceived
      ? "Actual posted Goods Receipts confirm full receipt. Supplier confirmation and shipping milestones were not recorded."
      : hasActualReceipts
        ? "Actual Inventory Goods Receipts show partial delivery. Shipping milestones were not recorded."
        : "No actual posted Goods Receipt found. Approval does not prove supplier confirmation, transit or delivery.");
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
