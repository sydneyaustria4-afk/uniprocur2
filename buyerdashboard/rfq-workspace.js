"use strict";

// Read-only RFQ workspace. Navigation reuses the existing Buyer RFQ pages.
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const state = { rfqs: [], filter: "all", search: "" };
  const labels = { all: "All Request for Quotation", draft: "Draft", awaiting: "Awaiting Quote", awarded: "Awarded", cancelled: "Cancelled" };
  let toastTimer;
  let requestBusy = false;
  let hasLoaded = false;
  let liveStatusRequest = 0;

  const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
  const date = value => {
    if (!value) return "—";
    const day = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(day.getTime()) ? "—" : day.toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" });
  };
  const el = (tag, className = "", value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const setText = (id, value) => { $(id).textContent = value == null || value === "" ? "—" : String(value); };

  function groupFor(rfq) {
    const status = String(rfq.status || "").toLowerCase();
    if (["cancelled", "canceled", "withdrawn"].includes(status)) return "cancelled";
    if (status === "awarded") return "awarded";
    if (status === "draft") return "draft";
    // Includes open, sent, pending, awaiting_quotation, and compared.
    // 'Compared' is shown explicitly on the card as Ready to Award.
    return "awaiting";
  }

  function detailFor(rfq) {
    const status = String(rfq.status || "").toLowerCase();
    if (status === "compared") return "Ready to Award";
    if (groupFor(rfq) === "awaiting") return "Awaiting";
    if (groupFor(rfq) === "awarded") return "Awarded";
    if (groupFor(rfq) === "cancelled") return "Cancelled";
    return "Draft";
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  function updateBuyer(buyer) {
    const name = String(buyer?.full_name || "Buyer");
    const email = String(buyer?.email || "");
    for (const id of ["sidebarName", "topName"]) setText(id, name);
    for (const id of ["sidebarEmail", "topEmail"]) setText(id, email || "—");
    for (const id of ["sidebarInitial", "topInitial"]) setText(id, name.trim().charAt(0).toUpperCase() || "B");
  }

  function rfqLink(rfq) {
    const number = encodeURIComponent(String(rfq.rfq_number || ""));
    const status = String(rfq.status || "").toLowerCase();
    if (status === "awarded" && Number(rfq.winner_quote_id) > 0) {
      return { href: `award-confirmation.html?rfq_number=${number}&quote_id=${encodeURIComponent(rfq.winner_quote_id)}`, label: "View Award" };
    }
    if (status === "compared") return { href: `comparison-matrix.html?rfq_number=${number}`, label: "Review Comparison" };
    return { href: `view-rfq.html?rfq_number=${number}`, label: status === "awarded" ? "View RFQ" : "View RFQ" };
  }

  function makeCard(rfq) {
    const group = groupFor(rfq);
    const card = el("article", "rfq-card");
    card.dataset.rfq = rfq.rfq_number || "";
    const top = el("div", "card-top");
    top.append(el("span", "number-badge", rfq.rfq_number || "RFQ"), el("span", `status-badge status-${group}`, detailFor(rfq)));
    const main = el("h2", "rfq-title", rfq.item_summary || `Request for Quotation · ${rfq.pr_number || ""}`);
    main.title = rfq.item_summary || "Request for Quotation";
    const meta = el("div", "card-meta");
    const numSuppliers = Math.max(0, Number(rfq.supplier_count) || 0);
    const savedQuotes = Math.min(numSuppliers, Math.max(0, Number(rfq.saved_quote_count) || 0));
    if (group === "awarded") {
      meta.append(el("span", "badge neutral", rfq.winning_supplier || "Winning supplier"));
      if (rfq.winning_amount != null) meta.append(el("span", "badge neutral", money(rfq.winning_amount)));
    } else {
      meta.append(el("span", "badge suppliers", `${numSuppliers} ${numSuppliers === 1 ? "Supplier" : "Suppliers"}`));
      meta.append(el("span", "badge neutral", `Due ${date(rfq.deadline)}`));
    }
    const progressBlock = el("div", "progress-block");
    if (group === "awaiting") {
      const progress = el("div", "quote-progress");
      progress.setAttribute("role", "img");
      progress.setAttribute("aria-label", `${savedQuotes} of ${numSuppliers} quotations saved`);
      const pieces = Math.min(numSuppliers || 1, 10);
      for (let index = 0; index < pieces; index++) progress.append(el("span", index < savedQuotes ? "is-filled" : ""));
      progressBlock.append(progress, el("small", "progress-note", `${savedQuotes} / ${numSuppliers} Saved Quotes`));
    } else if (group === "awarded") {
      progressBlock.append(el("small", "progress-note", rfq.existing_po_number ? `Linked PO: ${rfq.existing_po_number}` : "Award confirmed · Ready for Purchase Order"));
    } else {
      progressBlock.append(el("small", "progress-note", `${rfq.pr_number || "PR"} · ${date(rfq.created_at)}`));
    }
    const link = rfqLink(rfq);
    const action = el("a", "card-action", link.label);
    action.href = link.href;
    card.append(top, main, meta, progressBlock, action);
    return card;
  }

  async function refreshDemoReadiness(shown) {
    const requestId = ++liveStatusRequest;
    // Only open RFQs have a time-based readiness simulation in UniProcur.
    // Limit concurrent requests on large datasets.
    const candidates = shown.filter(r => String(r.status).toLowerCase() === "open").slice(0, 12);
    await Promise.all(candidates.map(async rfq => {
      try {
        const url = `../database/get-rfq-demo-status.php?rfq_number=${encodeURIComponent(rfq.rfq_number)}`;
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
        const data = await response.json();
        if (requestId !== liveStatusRequest || !response.ok || !data.success) return;
        const card = [...$("rfqCards").querySelectorAll(".rfq-card")].find(node => node.dataset.rfq === rfq.rfq_number);
        if (!card) return;
        const progress = card.querySelector(".quote-progress");
        const note = card.querySelector(".progress-note");
        if (!progress || !note) return;
        const ready = Math.max(0, Number(data.ready_count) || 0);
        const total = Math.max(0, Number(data.total_suppliers) || 0);
        progress.setAttribute("aria-label", `${ready} of ${total} simulated quotations ready`);
        [...progress.children].forEach((segment, i) => segment.classList.toggle("is-filled", i < ready));
        note.textContent = `${ready} / ${total} Quoted (demo)`;
      } catch (error) {
        console.warn(`Demo quote readiness unavailable for ${rfq.rfq_number}:`, error);
      }
    }));
  }

  function updateCounts() {
    const counts = { draft: 0, awaiting: 0, awarded: 0, cancelled: 0 };
    state.rfqs.forEach(r => { counts[groupFor(r)] += 1; });
    for (const name of Object.keys(counts)) setText(`count${name.charAt(0).toUpperCase()}${name.slice(1)}`, counts[name]);
  }

  function render() {
    const shown = state.rfqs.filter(rfq => {
      const key = [rfq.rfq_number, rfq.pr_number, rfq.item_summary, rfq.status, rfq.winning_supplier, rfq.existing_po_number].join(" ").toLowerCase();
      return (state.filter === "all" || groupFor(rfq) === state.filter) && key.includes(state.search);
    });
    setText("filterLabel", labels[state.filter]);
    setText("resultCount", `${shown.length} ${shown.length === 1 ? "RFQ" : "RFQs"}`);
    document.querySelectorAll("[data-stat-filter]").forEach(btn => {
      const selected = btn.dataset.statFilter === state.filter || (state.filter === "all" && btn.dataset.statFilter === "draft");
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    const grid = $("rfqCards");
    grid.replaceChildren();
    if (!shown.length) {
      grid.append(el("p", "message empty", hasLoaded ? (state.rfqs.length ? "No RFQs match this search or status. Try All Request for Quotation." : "No RFQs yet. Click + New RFQ to convert an approved Purchase Request.") : "Loading RFQs from your database..."));
      return;
    }
    shown.forEach(rfq => grid.append(makeCard(rfq)));
    // Existing simulation endpoint is the source of truth for readiness on
    // open RFQs; saved_quote_count above remains the non-simulated database count.
    refreshDemoReadiness(shown);
  }

  async function loadRfqs() {
    if (requestBusy) return;
    requestBusy = true;
    try {
      const response = await fetch("../database/get-buyer-rfq-workspace.php", {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || `Unable to retrieve RFQs (HTTP ${response.status}).`);
      state.rfqs = Array.isArray(result.rfqs) ? result.rfqs : [];
      updateBuyer(result.buyer || {});
      hasLoaded = true;
      $("pageError").hidden = true;
      updateCounts();
      render();
    } catch (error) {
      console.error("RFQ Workspace:", error);
      $("pageError").textContent = error.message || "Unable to load RFQ Workspace.";
      $("pageError").hidden = false;
      if (!hasLoaded) $("rfqCards").replaceChildren(el("p", "message error", "RFQ loading failed. Verify Buyer login, XAMPP PHP, and the new API file."));
    } finally { requestBusy = false; }
  }

  function setFilter(group) {
    state.filter = labels[group] ? group : "all";
    $("filterMenu").hidden = true;
    $("filterButton").setAttribute("aria-expanded", "false");
    render();
  }
  $("searchForm").addEventListener("submit", e => { e.preventDefault(); state.search = $("rfqSearch").value.trim().toLowerCase(); render(); });
  $("rfqSearch").addEventListener("input", () => { state.search = $("rfqSearch").value.trim().toLowerCase(); render(); });
  $("filterButton").addEventListener("click", () => {
    const open = $("filterMenu").hidden;
    $("filterMenu").hidden = !open;
    $("filterButton").setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => setFilter(btn.dataset.filter)));
  document.querySelectorAll("[data-stat-filter]").forEach(btn => btn.addEventListener("click", () => setFilter(btn.dataset.statFilter)));
  document.addEventListener("click", e => { if (!e.target.closest(".filter-wrap")) { $("filterMenu").hidden = true; $("filterButton").setAttribute("aria-expanded", "false"); } });
  document.querySelectorAll("[data-toast]").forEach(btn => btn.addEventListener("click", () => showToast(btn.dataset.toast)));
  $("notificationButton").addEventListener("click", () => showToast("No new notifications."));
  loadRfqs();
  setInterval(() => { if (!document.hidden) loadRfqs(); }, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadRfqs(); });
});
