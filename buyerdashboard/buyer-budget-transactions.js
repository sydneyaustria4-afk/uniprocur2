"use strict";
/* Visual demonstration only. No API calls, localStorage, or database writes.
   When Accounting integration is ready, replace SAMPLE_TRANSACTIONS with
   confirmed, read-only posted transactions from the Finance/Accounting API. */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const INITIAL_BUDGET = 500000;

  // Example rows from the Figma design. NOT real Accounting postings.
  const SAMPLE_TRANSACTIONS = Object.freeze([
    { date: "2026-10-05", reference: "PO-2026-04", description: "SynthHide Textile Corp.", category: "Production", amount: 40969.00 },
    { date: "2026-10-05", reference: "PO-2026-01", description: "SoleTech Rubber Mfg.", category: "Production", amount: 42840.00 },
    { date: "2026-10-01", reference: "PO-2026-03", description: "EcoBox Packaging", category: "Packaging", amount: 21168.00 },
    { date: "2026-10-25", reference: "PO-2026-02", description: "MetalCraft Hardware", category: "Production", amount: 26656.00 }
  ]);

  const currency = (value) => new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);
  const dateLabel = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "long", day: "2-digit", year: "numeric"
  });

  let selectedFilter = "all";
  let toastTimer;

  const totalUsed = SAMPLE_TRANSACTIONS.reduce((sum, transaction) => sum + transaction.amount, 0);
  $("totalBudget").textContent = currency(INITIAL_BUDGET);
  $("usedBudget").textContent = currency(totalUsed);
  $("remainingBudget").textContent = currency(INITIAL_BUDGET - totalUsed);

  function render() {
    const visible = SAMPLE_TRANSACTIONS.filter((transaction) =>
      selectedFilter === "all" || transaction.category.toLowerCase() === selectedFilter
    );

    const rows = $("transactionRows");
    rows.replaceChildren();

    if (visible.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "bt-empty";
      cell.textContent = "No preview transactions in this category.";
      row.append(cell);
      rows.append(row);
    } else {
      visible.forEach((transaction) => {
        const row = document.createElement("tr");
        const values = [
          dateLabel(transaction.date), transaction.reference,
          transaction.description, transaction.category, `−${currency(transaction.amount)}`
        ];
        values.forEach((value, index) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          if (index === 4) cell.className = "bt-amount";
          row.append(cell);
        });
        rows.append(row);
      });
    }

    $("transactionSummary").textContent =
      `${visible.length} sample transaction${visible.length === 1 ? "" : "s"} shown · Not posted to Accounting`;
  }

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      render();
    });
  });

  $("notificationButton").addEventListener("click", () => {
    const toast = $("transactionToast");
    toast.textContent = "Buyer notifications are not connected yet.";
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  });

  render();
});
