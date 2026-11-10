"use strict";
// Demo-only: no inventory API, no POST requests, no localStorage, no MySQL writes.
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const seedRequests = [
    {
      id: "REQ-2026-001", priority: "high", status: "pending",
      requester: "Inventory Team", date: "November 15, 2026",
      items: [
        {name: "Shoelaces", quantity: 200, unit: "pairs"},
        {name: "Black Leather", quantity: 150, unit: "pairs"},
        {name: "Foam Insole", quantity: 100, unit: "sq. ft."}
      ],
      justification: "Q4 Sneaker Production Line requires replenishment.",
      reason: ""
    }
  ];
  const copySeed = () => seedRequests.map(r => ({...r, items: r.items.map(i => ({...i}))}));
  let requests = copySeed();
  let search = "";
  let status = "pending";
  let priority = "all";
  let activeRequestId = null;
  let toastTimer;

  const node = (tag, cls = "", content) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (content !== undefined) el.textContent = String(content);
    return el;
  };
  const number = x => new Intl.NumberFormat("en-PH").format(x);

  function flash(message) {
    const toast = $("materialToast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {toast.hidden = true;}, 4000);
  }

  function setIdentity(buyer) {
    
const name = "Buyer";
const email = "buyer@gmail.com";
const initial = "B";

    for (const id of ["sidebarBuyerName", "topbarBuyerName"]) $(id).textContent = name;
    for (const id of ["sidebarBuyerEmail", "topbarBuyerEmail"]) $(id).textContent = email;
    for (const id of ["sidebarAvatar", "topbarAvatar"]) $(id).textContent = initial;
  }

  async function loadBuyerIdentity() {
    try {
      // Reuse the existing read-only Buyer API for identity; NOT an Inventory integration.
      const response = await fetch("../database/get-buyer-purchase-requests.php", {
        method: "GET", credentials: "same-origin", cache: "no-store", headers: {Accept: "application/json"}
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Buyer account unavailable");
      setIdentity(result.buyer || {});
    } catch (error) {
      setIdentity({full_name: "Buyer", email: "Account not connected"});
      console.info("Material Request preview: Buyer identity could not load.", error);
    }
  }

  const statusLabels = {pending: "Awaiting PR Creation", rejected: "Rejected (Preview)", converted: "Converted (Preview)"};
  const statusFilters = {all: "All Material Requests", pending: "Pending Material Request", rejected: "Rejected Material Request", converted: "Converted Material Request"};

  function card(request) {
    const root = node("article", "mr-card");
    const header = node("div", "mr-card-top");
    header.append(node("span", "mr-request-no", request.id));
    header.append(node("span", "mr-priority", request.priority === "high" ? "High Priority" : "Normal Priority"));
    header.append(node("span", `mr-status${request.status === "rejected" ? " is-rejected" : ""}${request.status === "converted" ? " is-converted" : ""}`, statusLabels[request.status] || request.status));
    root.append(header, node("h2", "mr-card-title", request.requester), node("span", "mr-date", request.date));
    const lines = node("ul", "mr-lines");
    for (const item of request.items) {
      const li = node("li");
      li.append(node("span", "mr-item-name", item.name),node("strong", "mr-item-qty", `${number(item.quantity)} ${item.unit}`));
      lines.append(li);
    }
    root.append(lines);
    const justification = node("p", "mr-justification");
    justification.append(node("strong", "", "Justification: "),document.createTextNode(request.justification));
    root.append(justification);
    if (request.status === "pending") {
      const actions = node("div", "mr-card-actions");
      const reject = node("button", "mr-reject", "Reject");
      reject.type = "button";
      reject.dataset.rejectRequest = request.id;
      const convert = node("button", "mr-convert", "Convert to Purchase Request");
      convert.type = "button";
      convert.dataset.convertRequest = request.id;
      actions.append(reject, convert);
      root.append(actions);
    } else {
      root.append(node("p", "mr-state-note", request.status === "rejected" ? `Demo rejected: ${request.reason}` : "Marked as converted in this browser preview. No PR was created in MySQL."));
    }
    return root;
  }

  function render() {
    const filtered = requests.filter(r => {
      const text = [r.id,r.requester,r.date,r.justification,...r.items.map(i=>i.name)].join(" ").toLowerCase();
      return (!search || text.includes(search)) && (status === "all" || r.status === status) && (priority === "all" || r.priority === priority);
    });
    const cards = $("materialCards");
    cards.replaceChildren();
    for (const r of filtered) cards.append(card(r));
    if (!filtered.length) cards.append(node("p", "mr-empty", "No demo material requests match your search or filter. Try Reset in the filter or Reset preview."));
    $("materialShowingLabel").textContent = statusFilters[status] || "Material Requests";
    $("materialCount").textContent = `${filtered.length} demo request${filtered.length === 1 ? "" : "s"}`;
  }

  const filterButton = $("materialFilterButton");
  const filterPanel = $("materialFilterPanel");
  function filterOpen(open) {filterPanel.hidden = !open;filterButton.setAttribute("aria-expanded",String(open));}
  filterButton.addEventListener("click", () => filterOpen(filterPanel.hidden));
  document.addEventListener("click", event => {
    if (event.target instanceof Element && !event.target.closest(".mr-filter-wrap")) filterOpen(false);
  });
  $("materialSearchForm").addEventListener("submit", event => {event.preventDefault();search = $("materialSearch").value.trim().toLowerCase();render();});
  $("materialSearch").addEventListener("input", () => {search = $("materialSearch").value.trim().toLowerCase();render();});
  $("applyMaterialFilters").addEventListener("click", () => {status = $("materialStatusFilter").value;priority = $("materialPriorityFilter").value;filterOpen(false);render();});
  $("clearMaterialFilters").addEventListener("click", () => {status="pending";priority="all";search="";$("materialStatusFilter").value="pending";$("materialPriorityFilter").value="all";$("materialSearch").value="";filterOpen(false);render();});
  $("resetPreview").addEventListener("click", () => {requests = copySeed();activeRequestId=null;status="pending";priority="all";search="";$("materialStatusFilter").value="pending";$("materialPriorityFilter").value="all";$("materialSearch").value="";render();flash("Sample request restored. No database changes were made.");});

  const openDialog = dialog => { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open",""); };
  const closeDialog = dialog => { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); };
  document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => closeDialog($(button.dataset.closeDialog))));
  for (const id of ["rejectDialog", "convertDialog"]) {
    const dialog = $(id);
    dialog.addEventListener("click", event => {if (event.target === dialog) closeDialog(dialog);});
  }
  $("materialCards").addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest("[data-reject-request], [data-convert-request]") : null;
    if (!target) return;
    activeRequestId = target.dataset.rejectRequest || target.dataset.convertRequest;
    const request = requests.find(r=>r.id===activeRequestId && r.status === "pending");
    if (!request) return flash("This demo request is not pending anymore. Reset preview to try again.");
    if (target.dataset.rejectRequest) {
      $("rejectTarget").textContent = `${request.id} • ${request.requester}`;
      $("rejectReason").value = "";
      openDialog($("rejectDialog"));
      $("rejectReason").focus();
    } else {
      $("convertRequestNumber").textContent = request.id;
      $("convertRequester").textContent = request.requester;
      const list = node("div", "mr-modal-items");
      request.items.forEach(i => {const row=node("div","mr-modal-item");row.append(node("span","",i.name),node("strong","",`${number(i.quantity)} ${i.unit}`));list.append(row);});
      $("convertMaterials").replaceChildren(list);
      openDialog($("convertDialog"));
    }
  });
  $("rejectForm").addEventListener("submit", event => {
    event.preventDefault();
    const reason = $("rejectReason").value.trim();
    if (reason.length < 5) {$("rejectReason").setCustomValidity("Please enter at least 5 characters.");$("rejectReason").reportValidity();return;}
    $("rejectReason").setCustomValidity("");
    const request = requests.find(r=>r.id===activeRequestId && r.status === "pending");
    if (!request) return;
    request.reason = reason;
    request.status = "rejected";
    closeDialog($("rejectDialog"));
    // Switch to All so the demo action result remains visible.
    status = "all";$("materialStatusFilter").value = "all";
    render();flash(`${request.id} marked Rejected (preview). Nothing sent to Inventory.`);
  });
  $("rejectReason").addEventListener("input",()=>$("rejectReason").setCustomValidity(""));
  $("confirmConvert").addEventListener("click", () => {
    const request = requests.find(r=>r.id===activeRequestId && r.status === "pending");
    if (!request) return;
    request.status = "converted";
    closeDialog($("convertDialog"));
    status = "all";$("materialStatusFilter").value="all";
    render();flash(`${request.id} marked Converted (preview). No Purchase Request saved in MySQL.`);
  });
  $("notificationButton").addEventListener("click",()=>flash("Demo only: Inventory notification delivery is not integrated yet."));
  setIdentity({full_name: "Buyer", email: "Loading account…"});
  $("materialStatusFilter").value = "pending";
  render();
  loadBuyerIdentity();
});
