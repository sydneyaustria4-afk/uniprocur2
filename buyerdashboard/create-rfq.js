"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("approvedPrTableBody");
  const resultCount = document.getElementById("resultCount");
  const toast = document.getElementById("pageToast");
  const notificationButton = document.getElementById("notificationButton");
  let toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function makeCell(value, className = "") {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value || "—";
    return cell;
  }

  function makeRow(pr) {
    const row = document.createElement("tr");
    row.appendChild(makeCell(pr.pr_number));

    const itemsCell = makeCell(pr.items || "No items recorded", "pr-items-cell");
    itemsCell.title = pr.items || "No items recorded";
    row.appendChild(itemsCell);

    row.appendChild(makeCell(pr.approved_at_display));
    row.appendChild(makeCell(pr.needed_by_display));

    const priorityCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "priority-badge";
    badge.textContent = "Medium";
    badge.title = "Display placeholder from the Figma design; priority is not stored in the current database schema.";
    priorityCell.appendChild(badge);
    row.appendChild(priorityCell);

    const actionCell = document.createElement("td");
    const editLink = document.createElement("a");
    editLink.className = "edit-button";
    editLink.textContent = "Edit";
    editLink.href = `../PR202601/edit-rfq2.html?pr_id=${encodeURIComponent(pr.id)}&pr_number=${encodeURIComponent(pr.pr_number)}`;
    editLink.setAttribute("aria-label", `Edit RFQ for ${pr.pr_number}`);
    actionCell.appendChild(editLink);
    row.appendChild(actionCell);

    return row;
  }

  function showMessage(message, isError = false) {
    tableBody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = isError ? "table-message error" : "table-message";
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (resultCount) resultCount.textContent = "";
  }

  async function loadApprovedPurchaseRequests() {
    showMessage("Loading approved Purchase Requests...");

    try {
      const response = await fetch(
        "../database/get-approved-purchase-requests.php",
        {
          method: "GET",
          credentials: "same-origin",
          headers: { "Accept": "application/json" }
        }
      );

      let result;
      try {
        result = await response.json();
      } catch (error) {
        throw new Error("The server returned an unreadable response. Check the PHP endpoint.");
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load approved Purchase Requests.");
      }

      const requests = Array.isArray(result.requests) ? result.requests : [];

      if (resultCount) {
        resultCount.textContent = `${requests.length} request${requests.length === 1 ? "" : "s"}`;
      }

      if (requests.length === 0) {
        showMessage("No approved Purchase Requests without an RFQ are available yet.");
        return;
      }

      tableBody.replaceChildren();
      requests.forEach((pr) => tableBody.appendChild(makeRow(pr)));

      // Add blank rows to retain the visual table height shown in Figma.
      const blankRows = Math.max(0, 5 - requests.length);
      for (let i = 0; i < blankRows; i++) {
        const row = document.createElement("tr");
        row.className = "empty-table-row";
        for (let j = 0; j < 6; j++) {
          row.appendChild(document.createElement("td"));
        }
        tableBody.appendChild(row);
      }

    } catch (error) {
      console.error("Approved PR loading error:", error);
      showMessage(error.message || "Unable to load approved Purchase Requests.", true);
      showToast(error.message || "Unable to load approved Purchase Requests.");
    }
  }

  if (notificationButton) {
    notificationButton.addEventListener("click", () => {
      showToast("No new notifications.");
    });
  }

  loadApprovedPurchaseRequests();
});
