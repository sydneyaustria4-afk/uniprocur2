
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  const grid = document.getElementById("purchaseRequestGrid");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");

  const filterButton = document.getElementById("filterButton");
  const filterMenu = document.getElementById("filterMenu");

  const currentFilterLabel =
    document.getElementById("currentFilterLabel");

  const resultCount = document.getElementById("resultCount");
  const toast = document.getElementById("toast");

  const summaryElements = {
    all: document.getElementById("countAll"),
    approved: document.getElementById("countApproved"),
    draft: document.getElementById("countDraft"),
    attention: document.getElementById("countAttention")
  };

  let requests = [];
  let activeFilter = "all";
  let searchTerm = "";
  let toastTimer = null;

  const filterLabels = {
    all: "All Purchase Request",
    approved: "Approved",
    draft: "Draft",
    pending: "Pending",
    rejected: "Rejected",
    attention: "Pending / Rejected"
  };

  // =====================================
  // TOAST
  // =====================================

  function showToast(message) {
    if (!toast || !message) return;

    toast.textContent = message;
    toast.classList.add("is-visible");

    window.clearTimeout(toastTimer);

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  // =====================================
  // NORMALIZE STATUS
  // =====================================

  function normalizeStatus(value) {
    const status = String(value || "")
      .trim()
      .toLowerCase();

    if (status === "submitted" || status === "pending") {
      return "pending";
    }

    if (
      status === "approved" ||
      status === "draft" ||
      status === "rejected"
    ) {
      return status;
    }

    return status || "pending";
  }

  function displayStatus(status) {
    const labels = {
      approved: "Approved",
      draft: "Draft",
      pending: "Pending",
      rejected: "Rejected"
    };

    return labels[status] ||
      status.charAt(0).toUpperCase() + status.slice(1);
  }

  // =====================================
  // FORMAT DATE
  // =====================================

  function formatDate(value) {
    if (!value) return "—";

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

    if (!match) return String(value);

    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  // =====================================
  // UPDATE BUYER PROFILE
  // =====================================

  function updateBuyer(result) {
    if (!result || !result.buyer) return;

    const name = result.buyer.full_name || "Buyer";
    const email = result.buyer.email || "";

    document.getElementById(
      "buyerSidebarName"
    ).textContent = name;

    document.getElementById(
      "buyerSidebarEmail"
    ).textContent = email;

    document.getElementById(
      "buyerTopName"
    ).textContent = name;

    document.getElementById(
      "buyerTopEmail"
    ).textContent = email;
  }

  // =====================================
  // UPDATE SUMMARY CARDS
  // =====================================

  function updateSummary() {

    const count = (status) =>
      requests.filter(
        request =>
          normalizeStatus(request.status) === status
      ).length;

    summaryElements.all.textContent =
      String(requests.length);

    summaryElements.approved.textContent =
      String(count("approved"));

    summaryElements.draft.textContent =
      String(count("draft"));

    summaryElements.attention.textContent =
      String(
        count("pending") + count("rejected")
      );
  }

  // =====================================
  // CREATE CARD CHIP
  // =====================================

  function createChip(text, className) {
    const chip = document.createElement("span");

    chip.className = className;
    chip.textContent = text;

    return chip;
  }

  // =====================================
  // CREATE PURCHASE REQUEST CARD
  // =====================================

  function createRequestCard(request) {

    const status = normalizeStatus(request.status);

    const card = document.createElement("article");
    card.className = "pr-card";

    // Card header.
    const top = document.createElement("div");
    top.className = "pr-card-top";

    const number = document.createElement("span");
    number.className = "pr-number";
    number.textContent = request.number || "PR";

    const statusBadge = document.createElement("span");

    statusBadge.className =
      `pr-status pr-status-${status}`;

    statusBadge.textContent = displayStatus(status);

    top.append(number, statusBadge);

    // Card body.
    const body = document.createElement("div");
    body.className = "pr-card-body";

    const title = document.createElement("h2");
    title.className = "pr-card-title";

    title.textContent =
      request.task || "Purchase Request";

    const meta = document.createElement("div");
    meta.className = "pr-card-meta";

    const category =
      request.category && request.category !== "—"
        ? request.category
        : "Purchase Request";

    meta.append(
      createChip(
        category,
        "pr-card-chip pr-card-chip-category"
      ),

      createChip(
        formatDate(request.required_date),
        "pr-card-chip pr-card-chip-date"
      )
    );

    body.append(title, meta);

    // Card action.
    const action = document.createElement("a");

    action.className = "pr-card-action";

    action.textContent =
      status === "draft" ? "Edit" : "View";

    action.href =
      `view-purchase-request.html?pr=${encodeURIComponent(
        request.number || ""
      )}`;

    action.setAttribute(
      "aria-label",
      `${status === "draft" ? "Edit" : "View"} ${
        request.number || "Purchase Request"
      }`
    );

    card.append(top, body, action);

    return card;
  }

  // =====================================
  // FILTER REQUESTS
  // =====================================

  function matchesFilter(request) {

    const status = normalizeStatus(request.status);

    if (activeFilter === "all") {
      return true;
    }

    if (activeFilter === "attention") {
      return status === "pending" ||
        status === "rejected";
    }

    return status === activeFilter;
  }

  // =====================================
  // RENDER PURCHASE REQUESTS
  // =====================================

  function renderRequests() {

    const visibleRequests = requests.filter(request => {

      if (!matchesFilter(request)) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const searchableText = [
        request.number,
        request.task,
        request.category,
        request.item_code,
        request.status
      ].join(" ").toLowerCase();

      return searchableText.includes(searchTerm);
    });

    grid.replaceChildren();

    if (visibleRequests.length === 0) {

      const empty = document.createElement("p");

      empty.className = "pr-empty-state";

      empty.textContent =
        requests.length === 0
          ? "No Purchase Requests yet. Select New PR to create your first request."
          : "No Purchase Requests match your search or selected filter.";

      grid.append(empty);

    } else {

      visibleRequests.forEach(request => {
        grid.append(createRequestCard(request));
      });

    }

    currentFilterLabel.textContent =
      filterLabels[activeFilter] || "All Purchase Request";

    resultCount.textContent =
      `${visibleRequests.length} ${
        visibleRequests.length === 1
          ? "request"
          : "requests"
      }`;

    document.querySelectorAll(
      "[data-summary-filter]"
    ).forEach(button => {

      button.classList.toggle(
        "is-selected",
        button.dataset.summaryFilter === activeFilter
      );

    });

    document.querySelectorAll(
      "[data-filter-option]"
    ).forEach(button => {

      button.classList.toggle(
        "is-active",
        button.dataset.filterOption === activeFilter
      );

    });
  }

  // =====================================
  // FETCH PURCHASE REQUESTS FROM MYSQL
  // =====================================

  async function loadPurchaseRequests() {

    grid.innerHTML =
      '<p class="pr-loading-state">Loading Purchase Requests...</p>';

    try {

      const response = await fetch(
        "../database/get-buyer-purchase-requests.php",
        {
          method: "GET",

          credentials: "same-origin",

          headers: {
            "Accept": "application/json"
          }
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
          "Unable to load Purchase Requests."
        );
      }

      requests = Array.isArray(result.requests)
        ? result.requests
        : [];

      updateBuyer(result);
      updateSummary();
      renderRequests();

      console.log(
        "Purchase Request page loaded:",
        requests
      );

    } catch (error) {

      console.error(
        "Purchase Request page error:",
        error
      );

      grid.replaceChildren();

      const errorBox = document.createElement("p");

      errorBox.className = "pr-error-state";

      errorBox.textContent =
        error.message ||
        "Unable to load Purchase Requests.";

      grid.append(errorBox);

      showToast(
        "Unable to load Purchase Requests. Check the database connection."
      );
    }
  }

  // =====================================
  // SEARCH
  // =====================================

  searchForm.addEventListener("submit", event => {
    event.preventDefault();

    searchTerm = searchInput.value
      .trim()
      .toLowerCase();

    renderRequests();
  });

  searchInput.addEventListener("input", () => {

    searchTerm = searchInput.value
      .trim()
      .toLowerCase();

    renderRequests();
  });

  // =====================================
  // SUMMARY CARD FILTERS
  // =====================================

  document.querySelectorAll(
    "[data-summary-filter]"
  ).forEach(button => {

    button.addEventListener("click", () => {

      activeFilter = button.dataset.summaryFilter;

      renderRequests();

    });

  });

  // =====================================
  // FILTER DROPDOWN
  // =====================================

  filterButton.addEventListener("click", () => {

    const isOpening = filterMenu.hidden;

    filterMenu.hidden = !isOpening;

    filterButton.setAttribute(
      "aria-expanded",
      String(isOpening)
    );

  });

  filterMenu.querySelectorAll(
    "[data-filter-option]"
  ).forEach(button => {

    button.addEventListener("click", () => {

      activeFilter = button.dataset.filterOption;

      filterMenu.hidden = true;

      filterButton.setAttribute(
        "aria-expanded",
        "false"
      );

      renderRequests();

    });

  });

  // =====================================
  // NAVIGATION AND TOASTS
  // =====================================

  document.addEventListener("click", event => {

    if (
      !event.target.closest(".pr-filter-wrap") &&
      !filterMenu.hidden
    ) {
      filterMenu.hidden = true;

      filterButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }

    const navButton = event.target.closest(
      ".pr-nav-item[data-view]"
    );

    if (navButton) {
      showToast(
        `${navButton.dataset.view} workspace selected.`
      );
    }

    const toastButton = event.target.closest(
      "[data-toast]"
    );

    if (toastButton) {
      showToast(toastButton.dataset.toast);
    }

  });

  // Initial load.
  loadPurchaseRequests();

});
