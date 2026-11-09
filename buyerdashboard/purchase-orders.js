"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const state = { orders: [], group: "all", search: "" };
  let toastTimeout = null;
  const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
  const date = value => {
    if (!value) return "—";
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" });
  };
  const names = { all: "All PO", pending: "Awaiting Approval", arriving: "Arriving Next", draft: "Drafts", approved: "In Production", rejected: "Rejected", received: "Received / Closed" };
  // Buyer-facing Figma status labels; MySQL stores approved, issued, etc. unchanged.
  const labels = { draft: "Draft", pending_approval: "Pending Approval", approved: "In Production", rejected: "Rejected", issued: "Issued", partial: "Partially Received", received: "Received", closed: "Closed" };
  function statusForDisplay(po) {
    const status = String(po.status || "").toLowerCase();
    if (status === "approved" || status === "issued") {
      if (po.tracking_inventory_accepted_at) return "Delivered (Demo)";
      if (po.tracking_confirmed_at) {
        const elapsed = Math.max(0, Number(po.tracking_elapsed_seconds) || 0);
        if (elapsed >= 120) return "Out for Delivery";
        if (elapsed >= 60) return "In Transit";
      }
    }
    return labels[status] || status || "—";
  }
  const groupMatch = (po, group) => {
    const s = String(po.status || "").toLowerCase();
    if (group === "all") return true;
    if (group === "pending") return s === "pending_approval";
    if (group === "arriving") return ["approved", "issued", "partial"].includes(s);
    if (group === "received") return ["received", "closed"].includes(s);
    return s === group;
  };
  const toast = msg => { $("poToast").textContent = msg; $("poToast").classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $("poToast").classList.remove("show"), 3300); };
  const setText = (id, value) => { $(id).textContent = value ?? "—"; };
  function updateIdentity(user) {
    const name = user?.full_name || "Buyer";
    const email = user?.email || "";
    const initial = name.charAt(0).toUpperCase() || "B";
    setText("sidebarName", name); setText("sidebarEmail", email);
    setText("topName", name); setText("topEmail", email);
    setText("sidebarInitial", initial); setText("topInitial", initial);
  }
  function counts() {
    setText("countAll", state.orders.length);
    setText("countPending", state.orders.filter(o => groupMatch(o, "pending")).length);
    setText("countArriving", state.orders.filter(o => groupMatch(o, "arriving")).length);
    setText("countDraft", state.orders.filter(o => groupMatch(o, "draft")).length);
  }
  function makeCard(po) {
    const card = document.createElement("article"); card.className = "po-card";
    const head = document.createElement("div"); head.className = "po-card-head";
    const number = document.createElement("span"); number.className = "po-card-number"; number.textContent = po.po_number || "—";
    const status = document.createElement("span"); status.className = `po-card-status ${po.status || ""}`; status.textContent = statusForDisplay(po);
    head.append(number, status);
    const body = document.createElement("div"); body.className = "po-card-body";
    const title = document.createElement("h2"); title.textContent = po.supplier_name || "Supplier";
    const meta = document.createElement("div"); meta.className = "po-card-meta";
    const orderDate = document.createElement("span"); orderDate.textContent = date(po.order_date);
    const amount = document.createElement("span"); amount.textContent = money(po.total_amount);
    meta.append(orderDate, amount);
    const item = document.createElement("p"); item.className = "po-card-item"; item.title = po.item_summary || ""; item.textContent = po.item_summary || "Purchase Order";
    body.append(title, meta, item);
    const action = document.createElement("a"); action.className = "po-card-action";
    if (po.status === "draft") {
      action.href = `create-purchase-order.html?rfq_number=${encodeURIComponent(po.rfq_number || "")}&quote_id=${encodeURIComponent(po.rfq_quote_id || "")}&po_number=${encodeURIComponent(po.po_number)}`;
      action.textContent = "Continue Draft";
    } else {
      action.href = `buyer-view-purchase-order.html?po_number=${encodeURIComponent(po.po_number)}`;
      action.textContent = "View PO";
    }
    card.append(head, body, action);
    return card;
  }
  function render() {
    const matches = state.orders.filter(po => {
      const search = [po.po_number, po.supplier_name, po.rfq_number, po.item_summary, statusForDisplay(po), po.status].join(" ").toLowerCase();
      return groupMatch(po, state.group) && (!state.search || search.includes(state.search));
    });
    $("filterName").textContent = names[state.group] || "All PO";
    $("resultsCount").textContent = `${matches.length} ${matches.length === 1 ? "order" : "orders"}`;
    $("poCards").replaceChildren();
    if (matches.length) matches.forEach(po => $("poCards").append(makeCard(po)));
    else { const msg = document.createElement("p"); msg.className = "empty-message"; msg.textContent = state.orders.length ? "No Purchase Orders match this filter or search." : "No Purchase Orders yet. Use New PO to start with an awarded RFQ."; $("poCards").append(msg); }
    document.querySelectorAll("[data-filter]").forEach(btn => { const isSelected = btn.dataset.filter === state.group; btn.classList.toggle("selected", isSelected); btn.setAttribute("aria-pressed", String(isSelected)); });
  }
  function selectGroup(group) { state.group = names[group] ? group : "all"; $("filterMenu").hidden = true; $("filterButton").setAttribute("aria-expanded", "false"); render(); }
  async function loadOrders() {
    try {
      const response = await fetch("../database/get-buyer-purchase-orders.php", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to retrieve orders.");
      updateIdentity(result.buyer || {});
      state.orders = Array.isArray(result.orders) ? result.orders : [];
      $("pageError").hidden = true;
      counts(); render();
    } catch (error) {
      console.error("Buyer PO listing:", error);
      $("pageError").textContent = error.message;
      $("pageError").hidden = false;
      $("poCards").replaceChildren();
      $("resultsCount").textContent = "Unable to load";
    }
  }
  async function openNewPo() {
    const modal = $("newPoDialog");
    $("rfqPicker").textContent = "Loading awarded RFQs...";
    modal.showModal();
    try {
      const response = await fetch("../database/get-buyer-awarded-rfqs.php", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load awarded RFQs.");
      $("rfqPicker").replaceChildren();
      if (!result.rfqs?.length) { const p = document.createElement("p"); p.textContent = "No awarded RFQs available. Award a supplier in the RFQ Comparison Matrix first."; $("rfqPicker").append(p); return; }
      result.rfqs.forEach(rfq => {
        const link = document.createElement("a"); link.className = "rfq-option";
        const info = document.createElement("div"); const name = document.createElement("strong"); name.textContent = `${rfq.rfq_number} · ${rfq.supplier_name}`;
        const detail = document.createElement("small"); detail.textContent = `Quoted amount: ${money(rfq.total_amount)}${rfq.deadline ? ` · RFQ deadline: ${date(rfq.deadline)}` : ""}`; info.append(name, detail);
        const label = document.createElement("span");
        if (rfq.existing_po_number && rfq.existing_po_status === "draft") {
          label.textContent = "Continue Draft →";
          link.href = `create-purchase-order.html?rfq_number=${encodeURIComponent(rfq.rfq_number)}&quote_id=${encodeURIComponent(rfq.quote_id)}&po_number=${encodeURIComponent(rfq.existing_po_number)}`;
        } else if (rfq.existing_po_number) {
          label.textContent = "View Existing PO →";
          link.href = `buyer-view-purchase-order.html?po_number=${encodeURIComponent(rfq.existing_po_number)}`;
        } else {
          label.textContent = "Create PO →";
          link.href = `create-purchase-order.html?rfq_number=${encodeURIComponent(rfq.rfq_number)}&quote_id=${encodeURIComponent(rfq.quote_id)}`;
        }
        link.append(info, label); $("rfqPicker").append(link);
      });
    } catch (error) { $("rfqPicker").textContent = error.message; }
  }
  $("searchForm").addEventListener("submit", event => { event.preventDefault(); state.search = $("poSearch").value.trim().toLowerCase(); render(); });
  $("poSearch").addEventListener("input", () => { state.search = $("poSearch").value.trim().toLowerCase(); render(); });
  $("filterButton").addEventListener("click", () => { $("filterMenu").hidden = !$("filterMenu").hidden; $("filterButton").setAttribute("aria-expanded", String(!$("filterMenu").hidden)); });
  document.querySelectorAll("[data-filter-value]").forEach(button => button.addEventListener("click", () => selectGroup(button.dataset.filterValue)));
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => selectGroup(button.dataset.filter)));
  document.addEventListener("click", event => { if (!event.target.closest(".filter-wrap")) { $("filterMenu").hidden = true; $("filterButton").setAttribute("aria-expanded", "false"); } });
  $("newPoButton").addEventListener("click", openNewPo);
  ["closeNewPo", "cancelNewPo"].forEach(id => $(id).addEventListener("click", () => $("newPoDialog").close()));
  $("newPoDialog").addEventListener("click", event => { if (event.target === $("newPoDialog")) $("newPoDialog").close(); });
  $("notificationButton").addEventListener("click", () => toast("No notifications available yet."));
  document.querySelectorAll("[data-coming-soon]").forEach(btn => btn.addEventListener("click", () => toast(`${btn.dataset.comingSoon} will be linked in a future module.`)));
  loadOrders();
  setInterval(() => { if (!document.hidden) loadOrders(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadOrders(); });
  if (new URLSearchParams(location.search).get("new") === "1") openNewPo();
});
