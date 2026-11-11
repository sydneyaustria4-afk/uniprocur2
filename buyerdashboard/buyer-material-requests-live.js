"use strict";
// Read-only localhost bridge. Never store the IMS API key in browser JavaScript.
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const state = { requests: [], status: "pending", search: "" };
  const formatQty = qty => Number.isFinite(Number(qty))
    ? new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 }).format(Number(qty))
    : String(qty ?? "—");
  const make = (tag, cls = "", value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  function message(text) {
    const toast = $("materialToast");
    toast.textContent = text;
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 5000);
  }

  // Retain existing layout, but make demo-only limitations explicit.
  document.title = "UniProcur | Buyer Material Requests (Local API Test)";
  const banner = document.querySelector(".mr-demo-banner span:nth-child(2)");
  if (banner) banner.textContent = "LOCAL API TEST — Actual Inventory requests. Read-only: no PR creation, Inventory rejection, or stock changes yet.";
  $("resetPreview").textContent = "Refresh Requests";
  $("resetPreview").title = "Fetch latest Inventory requests";
  $("materialPriorityFilter").closest("select")?.replaceChildren(new Option("All", "all"));
  const priorityLabel = document.querySelector('label[for="materialPriorityFilter"]');
  if (priorityLabel) priorityLabel.hidden = true;
  $("materialPriorityFilter").hidden = true;
  const statusSelect = $("materialStatusFilter");
  statusSelect.replaceChildren(new Option("All statuses", "all"), new Option("Pending", "pending"));
  statusSelect.value = state.status;
  $("materialFilterPanel").hidden = true;
  $("materialFilterButton").setAttribute("aria-expanded", "false");

  // Do not claim the Inventory account is the Procurement Buyer's identity.
  for (const id of ["sidebarBuyerName", "topbarBuyerName"]) $(id).textContent = "Buyer";
  for (const id of ["sidebarBuyerEmail", "topbarBuyerEmail"]) $(id).textContent = "Local API Test";
  for (const id of ["sidebarAvatar", "topbarAvatar"]) $(id).textContent = "B";

  function render() {
    const matches = state.requests.filter(req => {
      const content = [req.request_number, req.requester_team, req.request_date, req.remarks,
        ...(req.items || []).flatMap(item => [item.item_name, item.item_code])].join(" ").toLowerCase();
      return (state.status === "all" || req.status.toLowerCase() === state.status) &&
        (!state.search || content.includes(state.search));
    });
    $("materialShowingLabel").textContent = state.status === "all" ? "All Material Requests" : "Pending Material Requests";
    $("materialCount").textContent = `${matches.length} request${matches.length === 1 ? "" : "s"}`;
    const cards = $("materialCards");
    cards.replaceChildren();
    if (matches.length === 0) {
      cards.append(make("p", "mr-empty", state.requests.length === 0
        ? "No Procurement Material Requests in Inventory yet."
        : "No requests match your current filter."));
      return;
    }
    for (const req of matches) {
      const card = make("article", "mr-card");
      const heading = make("div", "mr-card-top");
      heading.append(
        make("span", "mr-request-no", req.request_number),
        make("span", "mr-priority", "Inventory API"),
        make("span", "mr-status", req.status || "Unknown")
      );
      card.append(heading, make("h2", "mr-card-title", req.requester_team || "Inventory"),
        make("span", "mr-date", req.request_date || "Date not provided"));
      const lines = make("ul", "mr-lines");
      for (const item of req.items || []) {
        const li = make("li");
        li.append(make("span", "mr-item-name", `${item.item_name}${item.item_code ? ` (${item.item_code})` : ""}`),
          make("strong", "mr-item-qty", `${formatQty(item.quantity)} ${item.unit}`));
        lines.append(li);
      }
      card.append(lines);
      const reason = make("p", "mr-justification");
      reason.append(make("strong", "", "Remarks: "), document.createTextNode(req.remarks || "No remarks provided"));
      card.append(reason);
      const actions = make("div", "mr-card-actions");
      const preview = make("button", "mr-convert", "Preview PR Conversion");
      preview.type = "button";
      preview.addEventListener("click", () => showPreview(req));
      actions.append(preview);
      card.append(actions);
      cards.append(card);
    }
  }

  function showPreview(req) {
    $("convertRequestNumber").textContent = req.request_number;
    $("convertRequester").textContent = req.requester_team || "Inventory";
    const lines = make("div", "mr-modal-items");
    for (const item of req.items || []) {
      const line = make("div", "mr-modal-item");
      line.append(make("span", "", `${item.item_name} (${item.item_code || "No code"})`),
        make("strong", "", `${formatQty(item.quantity)} ${item.unit}`));
      lines.append(line);
    }
    $("convertMaterials").replaceChildren(lines);
    $("confirmConvert").disabled = true;
    $("confirmConvert").title = "PR conversion is not connected yet";
    const dialog = $("convertDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  document.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => {
      const dialog = $(button.dataset.closeDialog);
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
  });
  $("convertDialog").addEventListener("click", event => {
    if (event.target === $("convertDialog")) $("convertDialog").close();
  });
  $("rejectForm").addEventListener("submit", event => event.preventDefault());
  $("notificationButton").addEventListener("click", () => message("Inventory notification sync is not connected yet."));

  $("materialFilterButton").addEventListener("click", () => {
    const panel = $("materialFilterPanel");
    panel.hidden = !panel.hidden;
    $("materialFilterButton").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("applyMaterialFilters").addEventListener("click", () => {
    state.status = statusSelect.value;
    $("materialFilterPanel").hidden = true;
    $("materialFilterButton").setAttribute("aria-expanded", "false");
    render();
  });
  $("clearMaterialFilters").addEventListener("click", () => {
    state.status = "pending";
    statusSelect.value = "pending";
    $("materialSearch").value = "";
    state.search = "";
    $("materialFilterPanel").hidden = true;
    $("materialFilterButton").setAttribute("aria-expanded", "false");
    render();
  });
  $("materialSearchForm").addEventListener("submit", event => {
    event.preventDefault();
    state.search = $("materialSearch").value.trim().toLowerCase();
    render();
  });
  $("materialSearch").addEventListener("input", event => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  async function load() {
    $("materialCards").replaceChildren(make("p", "mr-loading", "Loading actual Inventory requests…"));
    try {
      const response = await fetch("../database/get-inventory-material-requests.php", {
        method: "GET", cache: "no-store", credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      const data = await response.json();
      if (!response.ok || data.success !== true || !Array.isArray(data.data)) {
        throw new Error(data.message || "Inventory requests could not be loaded.");
      }
      state.requests = data.data.map(req => ({
        ...req,
        status: String(req.status || ""),
        items: Array.isArray(req.items) ? req.items : []
      }));
      const statuses = [...new Set(state.requests.map(req => req.status.trim()).filter(Boolean))];
      statusSelect.replaceChildren(new Option("All statuses", "all"), new Option("Pending", "pending"));
      for (const s of statuses) {
        if (s.toLowerCase() !== "pending") statusSelect.add(new Option(s, s.toLowerCase()));
      }
      if (![...statusSelect.options].some(option => option.value === state.status)) state.status = "all";
      statusSelect.value = state.status;
      render();
    } catch (error) {
      state.requests = [];
      $("materialCards").replaceChildren(make("p", "mr-empty", `Inventory connection failed: ${error.message}`));
      $("materialCount").textContent = "Connection failed";
    }
  }
  $("resetPreview").addEventListener("click", load);
  load();
});
