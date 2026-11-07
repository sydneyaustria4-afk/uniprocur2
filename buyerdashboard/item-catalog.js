"use strict";

document.addEventListener("DOMContentLoaded", () => {
  
const items = [
    { code: "LEA-0001", name: "Full-Grain Leather", category: "Leather", unit: "square feet" },
    { code: "LEA-0004", name: "Black Leather", category: "Leather", unit: "square feet" },
    { code: "LEA-0003", name: "Nubuck Leather", category: "Leather", unit: "square feet" },

    { code: "TEX-0001", name: "Mesh Fabric", category: "Textile", unit: "meters" },
    { code: "TEX-0003", name: "Canvas Fabric", category: "Textile", unit: "meters" },
    { code: "TEX-0004", name: "PU Leather", category: "Synthetic", unit: "meters" },

    { code: "COM-0001", name: "Rubber Sole", category: "Components", unit: "pairs" },
    { code: "COM-0002", name: "EVA Foam Sheets", category: "Components", unit: "pairs" },
    { code: "COM-0004", name: "Foam Insole", category: "Components", unit: "pairs" },

    { code: "HAR-0001", name: "Metal Eyelets", category: "Hardware", unit: "gross" },
    { code: "HAR-0002", name: "Metal Buckles", category: "Hardware", unit: "pieces" },
    { code: "HAR-0004", name: "Shoelaces", category: "Hardware", unit: "pieces" },

    { code: "PKG-0001", name: "Shoe Boxes", category: "Packaging", unit: "pieces" },
    { code: "PKG-0002", name: "Tissue Paper Rolls", category: "Packaging", unit: "pieces" },
    { code: "PKG-0003", name: "Packaging Tape", category: "Packaging", unit: "rolls" },

    { code: "ADH-0001", name: "Shoes Adhesive", category: "Adhesive", unit: "liters" }
];


  const tableBody = document.getElementById("itemTableBody");
  const searchForm = document.getElementById("itemSearchForm");
  const searchInput = document.getElementById("itemSearchInput");
  const filterButton = document.getElementById("filterButton");
  const filterPanel = document.getElementById("categoryFilterPanel");
  const categoryFilter = document.getElementById("categoryFilter");
  const clearFilterButton = document.getElementById("clearFilterButton");
  const cancelButton = document.getElementById("cancelButton");
  const notificationButton = document.getElementById("notificationButton");
  const toast = document.getElementById("toast");

  let toastTimer = null;
  let currentSearch = "";
  let currentCategory = "all";

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function returnToRequest() {
    window.location.href = "new-purchase-request.html";
  }

  function getFilteredItems() {
    const query = currentSearch.toLowerCase();

    return items.filter((item) => {
      const matchesSearch = !query || [
        item.code,
        item.name,
        item.category,
        item.unit
      ].some((value) => value.toLowerCase().includes(query));

      const matchesCategory = currentCategory === "all" ||
        item.category === currentCategory;

      return matchesSearch && matchesCategory;
    });
  }

  function addItemToRequest(item) {
    try {
      // The New Purchase Request page reads this one-time selection on return.
      sessionStorage.setItem("uniprocur_selected_pr_item", JSON.stringify(item));
      returnToRequest();
    } catch (error) {
      console.error("Unable to pass selected item to Purchase Request:", error);
      showToast("Unable to select this item. Please try again.");
    }
  }

  function renderItems() {
    const filteredItems = getFilteredItems();
    tableBody.replaceChildren();

    if (filteredItems.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "empty-cell";
      cell.textContent = "No matching items found.";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    filteredItems.forEach((item) => {
      const row = document.createElement("tr");

      [item.code, item.name, item.category, item.unit].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      const actionCell = document.createElement("td");
      actionCell.className = "action-cell";

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "add-item-row-button";
      addButton.textContent = "Add Item";
      addButton.setAttribute("aria-label", `Add ${item.name} to Purchase Request`);
      addButton.addEventListener("click", () => addItemToRequest(item));

      actionCell.appendChild(addButton);
      row.appendChild(actionCell);
      tableBody.appendChild(row);
    });
  }

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentSearch = searchInput.value.trim();
    renderItems();
  });

  // Live filtering also makes the search field convenient without pressing Search.
  searchInput.addEventListener("input", () => {
    currentSearch = searchInput.value.trim();
    renderItems();
  });

  filterButton.addEventListener("click", () => {
    const willOpen = filterPanel.hidden;
    filterPanel.hidden = !willOpen;
    filterButton.setAttribute("aria-expanded", String(willOpen));
  });

  categoryFilter.addEventListener("change", () => {
    currentCategory = categoryFilter.value;
    renderItems();
  });

  clearFilterButton.addEventListener("click", () => {
    categoryFilter.value = "all";
    currentCategory = "all";
    renderItems();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".filter-wrap") && !filterPanel.hidden) {
      filterPanel.hidden = true;
      filterButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !filterPanel.hidden) {
      filterPanel.hidden = true;
      filterButton.setAttribute("aria-expanded", "false");
      filterButton.focus();
    }
  });

  cancelButton.addEventListener("click", returnToRequest);

  notificationButton.addEventListener("click", () => {
    showToast("You have no new notifications.");
  });

  renderItems();
});
