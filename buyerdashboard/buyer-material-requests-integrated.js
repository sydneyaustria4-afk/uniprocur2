"use strict";
// LOCALHOST PR-DRAFT CONVERSION TEST. API key stays on server; conversion creates a real Procurement PR draft.
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const state = { requests: [], status: "pending", search: "", csrfToken: "", active: null, busy: false };
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
  document.title = "UniProcur | Buyer Material Requests (Local Conversion Test)";
  const banner = document.querySelector(".mr-demo-banner span:nth-child(2)");
  if (banner) banner.textContent = "LOCAL CONVERSION TEST — Inventory requests are live. Creating a PR draft writes ONLY to Procurement MySQL; it does not change Inventory stock or request status.";
  $("resetPreview").textContent = "Refresh Requests";
  $("resetPreview").title = "Fetch latest Inventory requests";
  $("materialPriorityFilter").closest("select")?.replaceChildren(new Option("All", "all"));
  const priorityLabel = document.querySelector('label[for="materialPriorityFilter"]');
  if (priorityLabel) priorityLabel.hidden = true;
  $("materialPriorityFilter").hidden = true;
  const statusSelect = $("materialStatusFilter");
  statusSelect.replaceChildren(new Option("All statuses", "all"), new Option("Pending", "pending"), new Option("Converted to PR", "converted"));
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
      return (state.status === "all" || (req.pr_number ? "converted" : req.status.toLowerCase()) === state.status) &&
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
        make("span", "mr-status", req.pr_number ? "Converted to PR" : (req.status || "Unknown"))
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
      if (req.pr_number) {
        const linked = make("p", "mr-state-note", `Linked Procurement PR: ${req.pr_number} (${req.pr_status || "draft"})`);
        card.append(linked);
      }
      const actions = make("div", "mr-card-actions");
      const action = make("button", "mr-convert", req.pr_number ? "View Linked PR" : "Review and Create PR Draft");
      action.type = "button";
      if (req.pr_number) {
        action.addEventListener("click", () => {
          window.location.href = `view-purchase-request.html?pr=${encodeURIComponent(req.pr_number)}`;
        });
      } else if (req.status.toLowerCase() === "pending") {
        action.addEventListener("click", () => showPreview(req));
      } else {
        action.disabled = true;
        action.title = "Only Pending Inventory requests can be converted.";
      }
      actions.append(action);
      card.append(actions);
      cards.append(card);
    }
  }

  function showPreview(req) {
    state.active = req;
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
    $("confirmConvert").disabled = false;
    $("confirmConvert").textContent = "Create PR Draft";
    $("confirmConvert").title = "Save a new linked PR draft into Procurement MySQL";
    $("inventoryRequiredDate").value = "";
    $("inventoryRequiredDate").min = new Date().toLocaleDateString("sv-SE");
    $("inventoryJustification").value = req.remarks
      ? `Inventory request ${req.request_number}: ${req.remarks}`
      : `Purchase of raw materials requested by Inventory (${req.request_number}).`;
    const dialog = $("convertDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  // Add required draft fields to the existing preview modal without changing the HTML structure.
  const detailRow = document.createElement("div");
  detailRow.className = "mr-conversion-inputs";
  detailRow.style.margin = "12px 0";
  const dateLabel = make("label", "mr-field", "Required Date (Buyer chooses):");
  dateLabel.htmlFor = "inventoryRequiredDate";
  const requiredInput = make("input");
  requiredInput.id = "inventoryRequiredDate";
  requiredInput.type = "date";
  requiredInput.required = true;
  requiredInput.style.cssText = "display:block;width:100%;margin-top:6px;margin-bottom:12px;padding:10px;border:1px solid #ccc;border-radius:7px;box-sizing:border-box";
  const reasonLabel = make("label", "mr-field", "Justification (editable):");
  reasonLabel.htmlFor = "inventoryJustification";
  const reasonInput = make("textarea");
  reasonInput.id = "inventoryJustification";
  reasonInput.maxLength = 5000;
  reasonInput.rows = 3;
  reasonInput.required = true;
  reasonInput.style.cssText = "display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #ccc;border-radius:7px;box-sizing:border-box";
  detailRow.append(dateLabel, requiredInput, reasonLabel, reasonInput);
  $("convertMaterials").insertAdjacentElement("afterend", detailRow);
  const modalNote = document.querySelector("#convertDialog .mr-modal-note");
  if (modalNote) modalNote.textContent = "Review the Inventory material lines and choose the Required Date before creating a real Procurement PR draft.";
  const disclaimer = document.querySelector("#convertDialog .mr-modal-disclaimer");
  if (disclaimer) disclaimer.textContent = "Creates a real Draft PR in Procurement MySQL. Inventory stock and request status will NOT change. Only submit the PR to Manager after reviewing item codes, quantities and date.";
  const statusText = document.querySelector("#convertDialog .mr-convert-summary div:nth-child(3) dd");
  if (statusText) statusText.textContent = "Will create a Draft PR";
  const modalHead = document.querySelector("#convertDialog .mr-modal-head small");
  if (modalHead) modalHead.textContent = "Inventory → Procurement • Local test";

  $("confirmConvert").addEventListener("click", async () => {
    if (state.busy || !state.active) return;
    const req = state.active;
    const requiredDate = $("inventoryRequiredDate").value;
    const justification = $("inventoryJustification").value.trim();
    if (!requiredDate) { message("Please choose the PR Required Date."); $("inventoryRequiredDate").focus(); return; }
    if (requiredDate < new Date().toLocaleDateString("sv-SE")) { message("Required Date cannot be in the past."); return; }
    if (!justification) { message("Enter a justification before creating the draft."); $("inventoryJustification").focus(); return; }
    if (!state.csrfToken) { message("Please refresh requests to restore the conversion session."); return; }

    const hasPreviousDraft = localStorage.getItem("uniprocur_saved_pr_record_id") ||
      localStorage.getItem("uniprocur_new_pr_draft") ||
      sessionStorage.getItem("uniprocur_new_pr_working");
    if (hasPreviousDraft && !window.confirm("You have another active PR draft in this browser. Any previously saved MySQL draft stays intact, but this Inventory request will replace your active browser draft. Continue?")) return;
    state.busy = true;
    $("confirmConvert").disabled = true;
    $("confirmConvert").textContent = "Creating Draft...";
    try {
      const response = await fetch("../database/convert-inventory-request-to-pr.php", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": state.csrfToken },
        body: JSON.stringify({ request_number: req.request_number, required_date: requiredDate, justification })
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.message || "Could not create PR draft.");
      // The existing PR form's own save mechanism will edit this exact MySQL draft.
      sessionStorage.removeItem("uniprocur_new_pr_working");
      sessionStorage.removeItem("uniprocur_selected_pr_item");
      localStorage.setItem("uniprocur_saved_pr_record_id", String(result.pr_id));
      localStorage.setItem("uniprocur_new_pr_draft", JSON.stringify({
        requestId: result.pr_id,
        requestNumber: result.pr_number,
        requiredDate: result.required_date,
        justification: result.justification,
        items: result.items,
        attachments: []
      }));
      window.location.href = "new-purchase-request.html";
    } catch (error) {
      message(error.message || "Cannot create PR draft.");
      $("confirmConvert").disabled = false;
      $("confirmConvert").textContent = "Create PR Draft";
      if (/already has|already linked|already converted/i.test(error.message || "")) {
        load();
      }
    } finally {
      state.busy = false;
    }
  });

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
      state.csrfToken = String(data.conversion_csrf_token || "");
      state.requests = data.data.map(req => ({
        ...req,
        status: String(req.status || ""),
        items: Array.isArray(req.items) ? req.items : []
      }));
      const statuses = [...new Set(state.requests.map(req => req.status.trim()).filter(Boolean))];
      statusSelect.replaceChildren(new Option("All statuses", "all"), new Option("Pending", "pending"), new Option("Converted to PR", "converted"));
      for (const s of statuses) {
        if (s.toLowerCase() !== "pending") statusSelect.add(new Option(s, s.toLowerCase()));
      }
      if (![...statusSelect.options].some(option => option.value === state.status)) state.status = "all";
      statusSelect.value = state.status;
      render();
    } catch (error) {
      state.csrfToken = "";
      state.requests = [];
      $("materialCards").replaceChildren(make("p", "mr-empty", `Inventory connection failed: ${error.message}`));
      $("materialCount").textContent = "Connection failed";
    }
  }
  $("resetPreview").addEventListener("click", load);
  load();
});
