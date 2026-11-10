"use strict";

// Manager PO page: real MySQL records, search/filter/export, 4-row pagination,
// recent orders, read-only details. Approval decisions are intentionally separate.
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 4;
  const currency = value => new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP"
  }).format(Number(value) || 0);

  const dateText = value => {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) :
      date.toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" });
  };

  const labelFor = status => ({
    pending_approval: "Pending", approved: "Approved", rejected: "Rejected",
    issued: "In Progress", partial: "In Progress", received: "Received", closed: "Closed"
  })[status] || status || "—";

  const classFor = status => ({
    pending_approval: "pending", approved: "approved", rejected: "rejected",
    issued: "in-progress", partial: "in-progress", received: "received", closed: "closed"
  })[status] || "pending";

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  const badge = status => element("span", `po-status ${classFor(status)}`, labelFor(status));

  const state = { orders: [], filtered: [], page: 1, search: "", statuses: [] };
  let toastHandle = null;

  function toast(message) {
    const el = $("poToast");
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => el.classList.remove("is-visible"), 3000);
  }

  
function updateManager(manager) {
  const name = "Manager";
  const email = "manager@gmail.com";
  const initial = "M";

  ["sidebarManagerName", "topbarManagerName"].forEach(id => {
    $(id).textContent = name;
  });

  ["sidebarManagerEmail", "topbarManagerEmail"].forEach(id => {
    $(id).textContent = email;
  });

  ["sidebarAvatar", "topbarAvatar"].forEach(id => {
    $(id).textContent = initial;
  });

  $("welcomeText").textContent = "Welcome Manager!";
}


  function makeRow(order) {
    const tr = document.createElement("tr");
    const po = element("td", "po-id", order.po_number);
    const supplier = element("td", "po-supplier");
    supplier.append(element("strong", "", order.supplier_name || "—"));
    supplier.append(element("small", "", order.item_summary || "—"));
    const orderDate = element("td", "po-date", dateText(order.order_date));
    const delivery = element("td", "po-date", dateText(order.expected_delivery));
    const amount = element("td", "po-amount", currency(order.total_amount));
    const status = element("td");
    status.append(badge(order.status));
    const action = element("td");
    const viewButton = element("button", "po-view", "View");
    viewButton.type = "button";
    viewButton.dataset.poNumber = order.po_number;
    viewButton.setAttribute("aria-label", `View ${order.po_number}`);
    action.append(viewButton);
    tr.append(po, supplier, orderDate, delivery, amount, status, action);
    return tr;
  }

  function drawPagination(totalPages) {
    const root = $("poPagination");
    root.replaceChildren();
    const button = (label, page, disabled = false, active = false) => {
      const btn = element("button", `po-page-btn${active ? " active" : ""}${label === "‹" || label === "›" ? " arrow" : ""}`, label);
      btn.type = "button";
      btn.disabled = disabled;
      btn.dataset.page = page;
      if (active) btn.setAttribute("aria-current", "page");
      root.append(btn);
    };
    button("‹", Math.max(1, state.page - 1), state.page === 1);

    // For large lists show neighboring pages as well as the first/last page.
    const pages = new Set([1, totalPages, state.page, state.page - 1, state.page + 1]);
    const visible = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a,b) => a-b);
    let previous = 0;
    for (const p of visible) {
      if (previous && p > previous + 1) root.append(element("span", "po-page-ellipsis", "…"));
      button(String(p), p, false, p === state.page);
      previous = p;
    }
    button("›", Math.min(totalPages, state.page + 1), state.page === totalPages);
  }

  function drawTable() {
    const rows = $("poTableRows");
    rows.replaceChildren();
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(Math.max(state.page, 1), totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const shown = state.filtered.slice(start, start + PAGE_SIZE);

    if (!shown.length) {
      const row = document.createElement("tr");
      const cell = element("td", "po-empty", total === 0 && state.orders.length === 0 ?
        "No Purchase Orders have been submitted for approval yet." : "No Purchase Orders match your search or filters.");
      cell.colSpan = 7;
      row.append(cell);
      rows.append(row);
    } else shown.forEach(order => rows.append(makeRow(order)));

    $("poResultsSummary").textContent = total ?
      `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} purchase orders` :
      "Showing 0 purchase orders";
    drawPagination(totalPages);
  }

  function applyFilters() {
    state.filtered = state.orders.filter(order => {
      const searchable = [order.po_number, order.supplier_name, order.rfq_number,
        order.item_summary, order.order_date, order.expected_delivery, labelFor(order.status)]
        .join(" ").toLowerCase();
      return (!state.search || searchable.includes(state.search)) &&
        (!state.statuses.length || state.statuses.includes(order.status));
    });
    state.page = 1;
    drawTable();
  }

  function drawRecent() {
    const list = $("recentPoList");
    list.replaceChildren();
    const orders = state.orders.slice(0, 3);
    if (!orders.length) {
      list.append(element("p", "po-recent-empty", "No submitted Purchase Orders yet."));
      return;
    }
    for (const order of orders) {
      const card = element("button", "po-recent-card");
      card.type = "button";
      card.dataset.poNumber = order.po_number;
      card.setAttribute("aria-label", `View details for ${order.po_number}`);
      const info = element("span", "po-recent-info");
      info.append(element("strong", "", order.po_number));
      info.append(element("span", "", order.supplier_name || "—"));
      info.append(element("span", "", dateText(order.order_date)));
      card.append(info, badge(order.status));
      list.append(card);
    }
  }

  async function loadOrders() {
    $("poPageError").hidden = true;
    try {
      const response = await fetch("../database/get-manager-purchase-orders.php", {
        credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load Purchase Orders.");
      state.orders = Array.isArray(data.orders) ? data.orders : [];
      updateManager(data.manager || {});
      applyFilters();
      drawRecent();
    } catch (error) {
      console.error("Manager PO load:", error);
      $("poPageError").textContent = error.message;
      $("poPageError").hidden = false;
      $("poTableRows").replaceChildren();
      const cell = element("td", "po-empty", "Unable to load Purchase Orders. Check Manager login and PHP error log.");
      cell.colSpan = 7;
      const tr = document.createElement("tr"); tr.append(cell); $("poTableRows").append(tr);
      $("poResultsSummary").textContent = "Unable to load records";
      $("recentPoList").replaceChildren(element("p", "po-recent-empty", "Purchase Order data unavailable."));
    }
  }

  function addDetailBox(root, title, value) {
    const box = element("div", "po-detail-box");
    box.append(element("small", "", title), element("strong", "", value || "—"));
    root.append(box);
  }

  async function viewOrder(poNumber) {
    const modal = $("poDetailDialog");
    $("detailTitle").textContent = poNumber;
    $("poDetailContent").textContent = "Loading Purchase Order details...";
    modal.showModal();
    try {
      const response = await fetch(`../database/get-manager-purchase-orders.php?po_number=${encodeURIComponent(poNumber)}`, {
        credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load PO details.");
      const po = data.po;
      const content = $("poDetailContent");
      content.replaceChildren();
      const info = element("div", "po-detail-grid");
      addDetailBox(info, "PO Number", po.po_number);
      addDetailBox(info, "RFQ Reference", po.rfq_number);
      addDetailBox(info, "Supplier", po.supplier_name);
      addDetailBox(info, "Order Date", dateText(po.order_date));
      addDetailBox(info, "Expected Delivery", dateText(po.expected_delivery));
      addDetailBox(info, "Status", labelFor(po.status));
      addDetailBox(info, "Total Amount (saved in MySQL)", currency(po.total_amount));
      addDetailBox(info, "Delivery Address", po.delivery_address);
      content.append(info);
      content.append(element("h3", "po-detail-subheading", "Purchase Order Items"));
      const wrap = element("div", "po-detail-items");
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const hr = document.createElement("tr");
      ["Item", "Ordered", "Received", "Unit Price", "Line Total"].forEach(v => hr.append(element("th", "", v)));
      head.append(hr); table.append(head);
      const body = document.createElement("tbody");
      for (const item of data.items || []) {
        const tr = document.createElement("tr");
        [item.item_name, `${Number(item.qty_ordered)} ${item.unit || ""}`,
         `${Number(item.qty_received || 0)} ${item.unit || ""}`,
         currency(item.unit_price), currency(item.subtotal)]
          .forEach(v => tr.append(element("td", "", v)));
        body.append(tr);
      }
      if (!body.children.length) {
        const tr = document.createElement("tr"); const td = element("td", "", "No PO items recorded."); td.colSpan = 5; tr.append(td); body.append(tr);
      }
      table.append(body); wrap.append(table); content.append(wrap);
      content.append(element("h3", "po-detail-subheading", "Notes to Supplier"));
      content.append(element("p", "po-detail-notes", po.notes_to_supplier || "No notes provided."));
    } catch (error) {
      console.error("PO detail:", error);
      $("poDetailContent").textContent = error.message;
    }
  }

  $("poSearchForm").addEventListener("submit", ev => { ev.preventDefault(); state.search = $("poSearch").value.trim().toLowerCase(); applyFilters(); });
  $("poSearch").addEventListener("input", () => { state.search = $("poSearch").value.trim().toLowerCase(); applyFilters(); });
  $("poFilterButton").addEventListener("click", () => {
    const menu = $("poFilterMenu"); menu.hidden = !menu.hidden;
    $("poFilterButton").setAttribute("aria-expanded", String(!menu.hidden));
  });
  $("applyPoFilters").addEventListener("click", () => {
    state.statuses = [...document.querySelectorAll(".po-status-filter:checked")].map(el => el.value);
    $("poFilterMenu").hidden = true; $("poFilterButton").setAttribute("aria-expanded", "false"); applyFilters();
  });
  $("resetPoFilters").addEventListener("click", () => {
    document.querySelectorAll(".po-status-filter").forEach(el => { el.checked = false; });
    state.statuses = []; state.search = ""; $("poSearch").value = "";
    $("poFilterMenu").hidden = true; $("poFilterButton").setAttribute("aria-expanded", "false"); applyFilters();
  });
  $("poPagination").addEventListener("click", ev => {
    const btn = ev.target.closest("button[data-page]");
    if (!btn || btn.disabled) return;
    state.page = Number(btn.dataset.page); drawTable();
  });
  document.addEventListener("click", ev => {
    if (!(ev.target instanceof Element)) return;
    if (!ev.target.closest(".po-filter-wrap")) {
      $("poFilterMenu").hidden = true; $("poFilterButton").setAttribute("aria-expanded", "false");
    }
    const viewBtn = ev.target.closest("[data-po-number]");
    if (viewBtn) {
      window.location.href = `manager-view-purchase-order.html?po_number=${encodeURIComponent(viewBtn.dataset.poNumber)}`;
    }
    const comingSoon = ev.target.closest("[data-coming-soon]");
    if (comingSoon) toast(`${comingSoon.dataset.comingSoon} will be connected in a later module.`);
  });
  $("closePoDetail").addEventListener("click", () => $("poDetailDialog").close());
  $("closePoFooter").addEventListener("click", () => $("poDetailDialog").close());
  $("poDetailDialog").addEventListener("click", ev => { if (ev.target === $("poDetailDialog")) $("poDetailDialog").close(); });

  // Real CSV export of the active search and filters (not Figma's mock data).
  $("exportPoCsv").addEventListener("click", () => {
    if (!state.filtered.length) { toast("No Purchase Orders to export."); return; }
    const columns = ["PO Number", "Supplier", "Items", "Order Date", "Expected Delivery", "Total Amount", "Status", "RFQ Number"];
    const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const body = state.filtered.map(po => [po.po_number, po.supplier_name, po.item_summary, po.order_date,
      po.expected_delivery, po.total_amount, labelFor(po.status), po.rfq_number].map(csvCell).join(","));
    const blob = new Blob(["\uFEFF" + [columns.map(csvCell).join(","), ...body].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "UniProcur_Manager_Purchase_Orders.csv";
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast(`Exported ${state.filtered.length} Purchase Order(s).`);
  });

  loadOrders();
});
