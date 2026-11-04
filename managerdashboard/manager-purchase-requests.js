"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const rowsElement = document.getElementById("requestRows");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("requestSearch");
  const filterButton = document.getElementById("filterButton");
  const filterMenu = document.getElementById("filterMenu");
  const applyFiltersButton = document.getElementById("applyFilters");
  const resetFiltersButton = document.getElementById("resetFilters");
  const resultsSummary = document.getElementById("resultsSummary");
  const pageIndicator = document.getElementById("pageIndicator");
  const previousPageButton = document.getElementById("previousPage");
  const nextPageButton = document.getElementById("nextPage");
  const pageError = document.getElementById("pageError");
  const toast = document.getElementById("toast");

  const PAGE_SIZE = 5;
  let allRequests = [];
  let filteredRequests = [];
  let currentPage = 1;
  let searchTerm = "";
  let selectedStatuses = [];
  let toastTimer = null;

  function showToast(message) {
    if (!message) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value == null ? "—" : String(value);
  }

  function formatQuantity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return new Intl.NumberFormat("en-PH", {
      maximumFractionDigits: 2
    }).format(number);
  }

  function normalizeStatus(value) {
    const status = String(value || "").toLowerCase();
    if (status === "submitted" || status === "pending" || status === "pending approval") return "pending";
    if (status === "approved") return "approved";
    if (status === "rejected") return "rejected";
    return status;
  }

  function statusLabel(status) {
    if (status === "pending") return "Pending";
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "—";
  }

  function updateManagerIdentity(manager) {
    const name = manager?.full_name || "Manager";
    const email = manager?.email || "";
    const initial = name.trim().charAt(0).toUpperCase() || "M";

    setText("sidebarManagerName", name);
    setText("sidebarManagerEmail", email);
    setText("topbarManagerName", name);
    setText("topbarManagerEmail", email);
    setText("sidebarAvatar", initial);
    setText("topbarAvatar", initial);
  }

  function updateSummary(summary) {
    setText("totalRequests", summary?.total ?? 0);
    setText("pendingRequests", summary?.pending ?? 0);
    setText("approvedRequests", summary?.approved ?? 0);
    setText("rejectedRequests", summary?.rejected ?? 0);
  }

  function makeCell(text, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text == null || text === "" ? "—" : String(text);
    return cell;
  }

  function renderRows() {
    rowsElement.replaceChildren();

    const total = filteredRequests.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredRequests.slice(startIndex, startIndex + PAGE_SIZE);

    if (pageRows.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "table-message";
      cell.textContent = allRequests.length === 0
        ? "No Purchase Requests have been submitted yet."
        : "No Purchase Requests match your search or filter.";
      row.append(cell);
      rowsElement.append(row);
    } else {
      pageRows.forEach((request) => {
        const row = document.createElement("tr");
        const prNumber = String(request.pr_number || "");
        const status = normalizeStatus(request.status);

        row.append(makeCell(prNumber, "pr-number"));
        row.append(makeCell(request.items_and_categories || request.items || "—", "item-cell"));
        row.append(makeCell(formatQuantity(request.total_quantity), "quantity-cell"));
        row.append(makeCell(request.created_at_display || "—", "date-cell"));

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = `status-badge status-${status}`;
        badge.textContent = statusLabel(status);
        statusCell.append(badge);
        row.append(statusCell);

        const actionCell = document.createElement("td");
        const viewButton = document.createElement("button");
        viewButton.className = "view-button";
        viewButton.type = "button";
        viewButton.textContent = "View";
        viewButton.dataset.prNumber = prNumber;
        viewButton.dataset.status = status;
        viewButton.setAttribute("aria-label", `View ${prNumber}`);
        actionCell.append(viewButton);
        row.append(actionCell);

        rowsElement.append(row);
      });
    }

    const from = total === 0 ? 0 : startIndex + 1;
    const to = Math.min(startIndex + PAGE_SIZE, total);
    resultsSummary.textContent = `Showing ${from}–${to} of ${total} requests`;
    pageIndicator.textContent = `${currentPage} / ${totalPages}`;
    previousPageButton.disabled = currentPage <= 1;
    nextPageButton.disabled = currentPage >= totalPages;
  }

  function applyCurrentFilters() {
    filteredRequests = allRequests.filter((request) => {
      const status = normalizeStatus(request.status);
      const text = [
        request.pr_number,
        request.items_and_categories,
        request.items,
        request.categories,
        request.created_at_display,
        statusLabel(status)
      ].join(" ").toLowerCase();

      const matchesSearch = !searchTerm || text.includes(searchTerm);
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(status);
      return matchesSearch && matchesStatus;
    });

    currentPage = 1;
    renderRows();
  }

  async function loadRequests() {
    pageError.hidden = true;
    rowsElement.innerHTML = '<tr><td colspan="6" class="table-message">Loading Purchase Requests...</td></tr>';

    try {
      const response = await fetch("../database/get-manager-purchase-requests.php", {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load Manager Purchase Requests.");
      }

      allRequests = Array.isArray(result.requests) ? result.requests : [];
      updateManagerIdentity(result.manager || {});
      updateSummary(result.summary || {});
      applyCurrentFilters();
    } catch (error) {
      console.error("Manager Purchase Requests error:", error);
      rowsElement.innerHTML = '<tr><td colspan="6" class="table-message">Purchase Requests could not be loaded.</td></tr>';
      resultsSummary.textContent = "Unable to load records";
      pageError.textContent = error.message || "Unable to load records. Check your Manager account and database connection.";
      pageError.hidden = false;
    }
  }

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchTerm = searchInput.value.trim().toLowerCase();
    applyCurrentFilters();
  });

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    applyCurrentFilters();
  });

  filterButton.addEventListener("click", () => {
    const shouldOpen = filterMenu.hidden;
    filterMenu.hidden = !shouldOpen;
    filterButton.setAttribute("aria-expanded", String(shouldOpen));
  });

  applyFiltersButton.addEventListener("click", () => {
    selectedStatuses = Array.from(document.querySelectorAll(".status-filter:checked"))
      .map((input) => input.value);
    filterMenu.hidden = true;
    filterButton.setAttribute("aria-expanded", "false");
    applyCurrentFilters();
  });

  resetFiltersButton.addEventListener("click", () => {
    document.querySelectorAll(".status-filter").forEach((input) => { input.checked = false; });
    selectedStatuses = [];
    searchInput.value = "";
    searchTerm = "";
    filterMenu.hidden = true;
    filterButton.setAttribute("aria-expanded", "false");
    applyCurrentFilters();
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    if (!event.target.closest(".filter-wrap")) {
      filterMenu.hidden = true;
      filterButton.setAttribute("aria-expanded", "false");
    }

    const viewButton = event.target.closest(".view-button");
    if (viewButton) {
      const prNumber = viewButton.dataset.prNumber;
      const status = normalizeStatus(viewButton.dataset.status);

      if (!prNumber) {
        showToast("Purchase Request number is missing.");
        return;
      }

      if (status === "approved") {
        window.location.href = `manager-request-approved.html?pr=${encodeURIComponent(prNumber)}`;
        return;
      }

      if (status === "rejected") {
        window.location.href = `manager-request-rejected.html?pr=${encodeURIComponent(prNumber)}`;
        return;
      }

      window.location.href = `manager-view-purchase-request.html?pr=${encodeURIComponent(prNumber)}`;
      return;
    }

    const comingSoon = event.target.closest("[data-coming-soon]");
    if (comingSoon) showToast(`${comingSoon.dataset.comingSoon} page will be built next.`);
  });

  previousPageButton.addEventListener("click", () => {
    if (currentPage > 1) { currentPage -= 1; renderRows(); }
  });
  nextPageButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
    if (currentPage < totalPages) { currentPage += 1; renderRows(); }
  });

  document.getElementById("notificationButton").addEventListener("click", () => {
    showToast("No new notifications.");
  });
  document.getElementById("signOutButton").addEventListener("click", () => {
    showToast("Sign out will be connected to the HR Universal Login.");
  });

  loadRequests();
});
