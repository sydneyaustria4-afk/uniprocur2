
"use strict";

const toast = document.getElementById("toast");
let toastTimer;

// Toast message
function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// Update text without changing the HTML structure
function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value || "—";
  }
}

// Format database dates
function formatDate(value) {
  if (!value) return "—";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit"
  }).format(date);
}

// Format quantity
function formatQuantity(value) {
  return Number(value).toLocaleString("en-PH", {
    maximumFractionDigits: 2
  });
}

/* =========================================
   UPDATE EXISTING PRODUCT CARDS
   Keep images, categories and descriptions.
========================================= */

function updateProductCards(items) {
  const productCards = document.querySelectorAll(
    ".products-panel .product-row"
  );

  productCards.forEach((card) => {
    const title = card.querySelector(".product-copy h2");

    if (!title) return;

    const productName = title.textContent.trim().toLowerCase();

    const databaseItem = items.find((item) =>
      item.item_name.trim().toLowerCase() === productName
    );

    // Do not remove the card if no matching database item exists.
    if (!databaseItem) return;

    const metadataRows = card.querySelectorAll(".product-meta");

    // Find the existing Qty row.
    const quantityRow = Array.from(metadataRows).find((row) => {
      const label = row.querySelector("span");

      return label &&
        label.textContent.trim().toLowerCase() === "qty:";
    });

    if (!quantityRow) return;

    const quantityValue = quantityRow.querySelector("strong");

    if (quantityValue) {
      quantityValue.textContent =
        `${formatQuantity(databaseItem.qty)} ${databaseItem.unit}`;
    }
  });
}

/* =========================================
   LOAD PURCHASE REQUEST FROM MYSQL
========================================= */

async function loadPurchaseRequest() {
  const params = new URLSearchParams(window.location.search);
  const prNumber = params.get("pr") || "PR-2026-01";

  try {
    const response = await fetch(
      `../database/get-purchase-request.php?pr_number=${encodeURIComponent(prNumber)}`
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to load Purchase Request."
      );
    }

    const pr = result.purchase_request;

    // Update Purchase Request metadata.
    setText("prNumber", pr.pr_number);
    setText("prCreatedDate", formatDate(pr.created_at));
    setText("prApprovedDate", formatDate(pr.approved_at));
    setText("prNeededDate", formatDate(pr.needed_by));

    // Update buyer account information.
    setText("loggedInName", pr.created_by_name);
    setText("loggedInEmail", pr.created_by_email);

    const avatar = document.getElementById("loggedInAvatar");

    if (avatar) {
      avatar.textContent = pr.created_by_name
        ? pr.created_by_name.charAt(0).toUpperCase()
        : "?";
    }

    // Update quantities in the existing product cards.
    updateProductCards(result.items);

    document.title = `${pr.pr_number} | View Purchase Request`;

  } catch (error) {
    console.error("Purchase Request Error:", error);
    showToast(error.message);
  }
}

/* =========================================
   EXISTING BUTTONS
========================================= */

// Back button
const backButton = document.getElementById("backButton");

if (backButton) {
  backButton.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href =
        "../buyerdashboard/buyer-dashboard.html";
    }
  });
}

// Create RFQ button
const createRfqBtn = document.getElementById("createRfqBtn");

if (createRfqBtn) {
  createRfqBtn.addEventListener("click", () => {
    window.location.href = "edit-rfq2.html";
  });
}

// Notifications
const notificationButton = document.querySelector(
  ".notification-button"
);

if (notificationButton) {
  notificationButton.addEventListener("click", () => {
    showToast("You have no new notifications.");
  });
}

// Profile menu
const profileButton = document.querySelector(".profile-chevron");

if (profileButton) {
  profileButton.addEventListener("click", () => {
    showToast("The profile menu has not been connected yet.");
  });
}

// Load Purchase Request
loadPurchaseRequest();

