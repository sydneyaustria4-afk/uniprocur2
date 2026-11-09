"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const poNumber = (params.get("po_number") || "").trim();
  const money = value => new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const formatQty = value => new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const date = value => {
    if (!value) return "—";
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? String(value) :
      parsed.toLocaleDateString("en-PH", { month: "long", day: "2-digit", year: "numeric" });
  };
  const dateTime = value => {
    if (!value) return "—";
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? String(value) :
      parsed.toLocaleString("en-PH", {
        month: "short", day: "2-digit", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true
      });
  };
  const read = value => value == null || String(value).trim() === "" ? "Not provided" : String(value);
  const set = (id, value) => { const node = $(id); if (node) node.textContent = String(value ?? "—"); };
  const statusText = status => ({
    pending_approval: "Pending Approval", approved: "Approved", rejected: "Rejected",
    issued: "Issued", partial: "Partially Received", received: "Received", closed: "Closed"
  })[status] || status || "—";
  let currentPo = null;
  let csrfToken = "";
  let currentDecision = "";
  let busy = false;
  let toastTimeout = null;

  const toast = message => {
    set("toast", message);
    $("toast").classList.add("show");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => $("toast").classList.remove("show"), 3700);
  };

  const statusBadge = status => {
    const badge = $("statusBadge");
    badge.className = "status-badge " + (
      status === "pending_approval" ? "pending" :
      status === "approved" ? "approved" :
      status === "rejected" ? "rejected" : "issued"
    );
    badge.textContent = statusText(status);
  };

  function updateActions(status) {
    const pending = status === "pending_approval";
    $("decisionActions").hidden = !pending;
    set("decisionNote", pending ? "Review the Purchase Order carefully before approving or rejecting." :
      `This Purchase Order is ${statusText(status).toLowerCase()}. Approval actions are no longer available.`);
  }

  function showProfile() {
    if (!currentPo) return;
    const fields = [
      ["Supplier", read(currentPo.supplier_name)],
      ["Contact", read(currentPo.supplier_contact)],
      ["Email", read(currentPo.supplier_email)],
      ["Phone", read(currentPo.supplier_phone)],
      ["Location", read(currentPo.supplier_location)],
      ["Payment Terms", read(currentPo.payment_terms)]
    ];
    const root = $("profileContent");
    root.replaceChildren();
    fields.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "profile-row";
      const name = document.createElement("span"); name.textContent = label;
      const detail = document.createElement("strong"); detail.textContent = value;
      row.append(name, detail);
      root.append(row);
    });
    $("supplierDialog").showModal();
  }

  function render(data) {
    const po = data.po;
    currentPo = po;
    csrfToken = data.csrf_token || "";
    const name = data.manager?.full_name || "Manager";
    const email = data.manager?.email || "";
    set("managerName", name);
    set("managerEmail", email);
    set("managerAvatar", name.trim().charAt(0).toUpperCase() || "M");
    set("headerPoNumber", po.po_number);
    set("poNumber", po.po_number);
    set("summaryPo", po.po_number);
    set("createdAt", `Created: ${dateTime(po.created_at)}`);
    set("summarySupplier", po.supplier_name || "—");
    set("summaryDate", date(po.order_date));
    set("summaryRfq", po.rfq_number || "—");
    set("deliveryAddress", po.delivery_address || "—");
    set("orderDate", date(po.order_date));
    set("expectedDelivery", date(po.expected_delivery));
    set("paymentTerms", po.payment_terms || "—");
    set("supplierName", po.supplier_name || "—");
    set("supplierAvatar", (po.supplier_name || "S").trim().split(/\s+/).slice(0, 2)
      .map(x => x.charAt(0).toUpperCase()).join(""));
    set("supplierContact", read(po.supplier_contact));
    set("supplierEmail", read(po.supplier_email));
    set("supplierPhone", read(po.supplier_phone));
    set("supplierLocation", read(po.supplier_location));

    statusBadge(po.status);
    updateActions(po.status);

    const rows = $("itemRows");
    rows.replaceChildren();
    (data.items || []).forEach((item, index) => {
      const row = document.createElement("tr");
      const values = [index + 1, item.item_name || "—", formatQty(item.qty_ordered),
        item.unit || "—", money(item.unit_price), money(item.subtotal)];
      values.forEach(value => {
        const td = document.createElement("td");
        td.textContent = String(value);
        row.append(td);
      });
      rows.append(row);
    });
    if (!rows.children.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "empty-row";
      cell.textContent = "No ordered items recorded.";
      row.append(cell); rows.append(row);
    }
    const subtotal = Number(po.total_amount) || 0;
    const vat = Math.round(subtotal * 0.12 * 100) / 100;
    set("subtotal", money(subtotal));
    set("vatAmount", money(vat));
    set("grandTotal", money(subtotal + vat));
    const notes = String(po.notes_to_supplier || "").trim();
    $("notesWrapper").hidden = !notes;
    set("supplierNotes", notes || "—");
    $("pageStatus").hidden = true;
    $("poPage").hidden = false;
    document.title = `UniProcur | ${po.po_number}`;
  }

  async function loadPo() {
    if (!poNumber || !/^PO-[A-Za-z0-9-]+$/.test(poNumber)) {
      set("pageStatus", "Missing or invalid PO number. Return to the Manager Purchase Order page.");
      return;
    }
    try {
      const response = await fetch(
        `../database/get-manager-purchase-order.php?po_number=${encodeURIComponent(poNumber)}`,
        { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load Purchase Order.");
      render(data);
    } catch (error) {
      console.error("Manager PO details:", error);
      set("pageStatus", error.message || "Unable to load Purchase Order.");
      $("pageStatus").hidden = false;
    }
  }

  function openDecision(decision) {
    if (busy || !currentPo || currentPo.status !== "pending_approval") return;
    currentDecision = decision;
    $("decisionCheck").checked = false;
    $("confirmDecision").disabled = true;
    set("decisionHeading", decision === "approve" ? "Approve Purchase Order" : "Reject Purchase Order");
    set("decisionMessage", `Are you sure you want to ${decision} ${currentPo.po_number}?`);
    const button = $("confirmDecision");
    button.textContent = decision === "approve" ? "Confirm Approval" : "Confirm Rejection";
    button.className = "dialog-submit" + (decision === "reject" ? " reject" : "");
    $("decisionDialog").showModal();
  }

  async function submitDecision(event) {
    event.preventDefault();
    if (busy || !currentDecision || !currentPo || !$("decisionCheck").checked) return;
    busy = true;
    $("confirmDecision").disabled = true;
    try {
      const response = await fetch("../database/update-purchase-order-decision.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ po_number: currentPo.po_number, decision: currentDecision })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to save PO decision.");
      currentPo.status = data.status;
      statusBadge(data.status);
      updateActions(data.status);
      $("decisionDialog").close();
      toast(data.message || "Manager decision saved successfully.");
    } catch (error) {
      console.error("Manager PO decision:", error);
      toast(error.message || "Unable to save PO decision.");
    } finally {
      busy = false;
      $("confirmDecision").disabled = !$("decisionCheck").checked;
    }
  }

  $("approvePo").addEventListener("click", () => openDecision("approve"));
  $("rejectPo").addEventListener("click", () => openDecision("reject"));
  $("decisionCheck").addEventListener("change", value => {
    $("confirmDecision").disabled = !value.target.checked || busy;
  });
  $("confirmForm").addEventListener("submit", submitDecision);
  $("cancelDecision").addEventListener("click", () => $("decisionDialog").close());
  $("dialogClose").addEventListener("click", () => $("decisionDialog").close());
  $("supplierProfile").addEventListener("click", showProfile);
  $("closeProfile").addEventListener("click", () => $("supplierDialog").close());
  $("closeProfileFooter").addEventListener("click", () => $("supplierDialog").close());
  $("notificationButton").addEventListener("click", () => toast("No notifications in this module yet."));
  $("printPo").addEventListener("click", () => window.print());
  // Built-in browser PDF workflow: choose 'Save as PDF' in the print dialog.
  $("downloadPo").addEventListener("click", () => window.print());
  loadPo();
})();
