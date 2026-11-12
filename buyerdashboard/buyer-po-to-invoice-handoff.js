/* UniProcur Local PO -> Inventory GR -> Invoice navigation bridge.
 * READ ONLY: no PO/stock/invoice/Finance records are created by this file.
 * This bridge relies on the existing real GR endpoint, and will not claim
 * receipt success if that endpoint cannot verify recorded Inventory GRs.
 */
"use strict";
(() => {
  document.addEventListener("DOMContentLoaded", async () => {
    // This patch may be installed after an earlier manual copy.
    // Prevent multiple DOMContentLoaded hooks from inserting duplicate actions.
    if (window.__uniprocurPoInvoiceBridgeMountedV2) return;
    window.__uniprocurPoInvoiceBridgeMountedV2 = true;
    const params = new URLSearchParams(window.location.search);
    const poNumber = (params.get("po_number") || "").trim();
    if (!/^PO-[A-Za-z0-9-]{1,26}$/.test(poNumber)) return;
    const grButton = document.getElementById("viewGrButton");
    const actionRow = document.querySelector(".document-actions");
    if (!grButton || !actionRow) return;

    // Replace the old demonstration toast with the existing REAL GR reader.
    // The capture listener runs before the old click handler (bubble phase).
    grButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = "buyer-real-goods-receipts.html?po_number=" + encodeURIComponent(poNumber);
    }, true);
    grButton.title = "View posted Inventory Goods Receipts for this PO (local XAMPP)";

    // Reuse the existing button if an older patch inserted it in the HTML.
    const existingButtons = Array.from(actionRow.querySelectorAll('[id="poRecordInvoiceButton"]'));
    existingButtons.slice(1).forEach(el => el.remove());
    const button = existingButtons[0] || document.createElement("button");
    button.type = "button";
    button.id = "poRecordInvoiceButton";
    button.className = "outline-button";
    button.textContent = "Record Invoice";
    button.disabled = true;
    button.hidden = true; // Do not suggest invoicing before genuine Inventory GR verification.
    button.style.display = "none"; // Protect against author CSS overriding the hidden attribute.
    button.title = "Waiting for real Inventory Goods Receipts";
    if (!button.isConnected) actionRow.appendChild(button);

    try {
      const [poResponse, receiptResponse] = await Promise.all([
        fetch("../database/get-buyer-purchase-orders.php?po_number=" + encodeURIComponent(poNumber), {
          credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
        }),
        fetch("../database/get-buyer-real-goods-receipts.php?po_number=" + encodeURIComponent(poNumber), {
          credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
        })
      ]);
      const [poData, receiptData] = await Promise.all([
        poResponse.json(), receiptResponse.json()
      ]);
      if (!poResponse.ok || !poData.success || !poData.po) return;
      if (!receiptResponse.ok || !receiptData.success || !receiptData.po) return;
      if (poData.po.po_number !== poNumber || receiptData.po.po_number !== poNumber) return;
      const status = String(poData.po.status || "").toLowerCase();
      const realReceipts = Array.isArray(receiptData.receipts) ? receiptData.receipts : [];
      const items = Array.isArray(receiptData.items) ? receiptData.items : [];
      const matched = items.length > 0 && items.every(x => x.matches_real_receipts === true);
      const accepted = items.reduce((sum, x) => sum + (Number(x.real_accepted) || 0), 0);
      // Real receiving, quantity reconciliation and eligible PO status are mandatory.
      if (!["partial", "received"].includes(status) || !realReceipts.length || !matched || accepted <= 0) return;

      button.hidden = false;
      button.style.removeProperty("display");
      button.disabled = false;
      button.title = "Open the existing Invoice page for this PO; invoice verification remains a separate action";
      button.addEventListener("click", () => {
        window.location.href = "buyer-invoices.html?record_invoice=1&po_number=" + encodeURIComponent(poNumber);
      });
    } catch (error) {
      console.warn("PO → Invoice navigation is unavailable until real Inventory GR can be verified:", error);
      // Fail closed: never enable invoicing on a failed GR verification.
    }
  });
})();
