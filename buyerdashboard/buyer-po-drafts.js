
"use strict";

// Called after the existing Purchase Request table renders.
window.loadBuyerPODrafts = async function () {

    const tbody = document.getElementById(
        "pending-request-rows"
    );

    if (!tbody) return;

    try {
        const response = await fetch(
            "../database/buyer-po-drafts.php",
            {
                credentials: "same-origin",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message || "Unable to load PO drafts."
            );
        }

        const drafts = data.drafts || [];

        if (drafts.length) {
            // Remove placeholder but keep existing PR rows.
            tbody
                .querySelector(".table-empty-state")
                ?.closest("tr")
                ?.remove();
        }

        drafts.forEach(draft => {

            const tr = document.createElement("tr");
            tr.classList.add("po-draft-row");

            const task = document.createElement("td");
            const number = document.createElement("td");
            const status = document.createElement("td");
            const actions = document.createElement("td");

            const badge = document.createElement("span");

            const continueBtn = document.createElement(
                "button"
            );

            const cancelBtn = document.createElement(
                "button"
            );

            task.textContent =
                `Purchase Order — ${draft.supplier_name}`;

            number.textContent = draft.po_number;

            badge.className = "status draft";
            badge.textContent = "Draft PO";

            status.append(badge);

            // ========================================
            // CONTINUE BUTTON
            // ========================================

            continueBtn.type = "button";
            continueBtn.className = "mini-action";
            continueBtn.textContent = "Continue";

            continueBtn.dataset.poAction = "continue";
            continueBtn.dataset.poNumber = draft.po_number;
            continueBtn.dataset.rfqNumber = draft.rfq_number;
            continueBtn.dataset.quoteId = draft.rfq_quote_id;

            // ========================================
            // CANCEL BUTTON
            // ========================================

            cancelBtn.type = "button";
            cancelBtn.className = "mini-action";
            cancelBtn.textContent = "Cancel Draft";

            cancelBtn.dataset.poAction = "cancel";
            cancelBtn.dataset.poNumber = draft.po_number;

            const actionGroup = document.createElement("div");
actionGroup.className = "po-draft-actions";

actionGroup.append(continueBtn, cancelBtn);
actions.append(actionGroup);

            tr.append(
                task,
                number,
                status,
                actions
            );

            tbody.append(tr);
        });

        // Include PO drafts in My Drafts count.
        const countElement = document.querySelector(
            '[data-summary-count="drafts"]'
        );

        if (countElement) {
            const prCount =
                Number(countElement.textContent) || 0;

            countElement.textContent =
                String(prCount + drafts.length);
        }

    } catch (error) {
        console.error("PO draft listing error:", error);

        if (typeof showToast === "function") {
            showToast(error.message);
        }
    }
};

// ========================================
// HANDLE CONTINUE / CANCEL BUTTONS
// ========================================

document.addEventListener("click", async event => {

    if (!(event.target instanceof Element)) return;

    const button = event.target.closest(
        "[data-po-action]"
    );

    if (!button) return;

    const poNumber = button.dataset.poNumber;

    // CONTINUE: Open the saved Purchase Order.
    if (button.dataset.poAction === "continue") {

        const query = new URLSearchParams({
            po_number: poNumber,
            rfq_number: button.dataset.rfqNumber,
            quote_id: button.dataset.quoteId
        });

        window.location.href =
            `create-purchase-order.html?${query}`;

        return;
    }

    // CANCEL: Mark the saved draft as cancelled.
    if (button.dataset.poAction !== "cancel") return;

    const confirmed = window.confirm(
        `Cancel ${poNumber}? ` +
        "The PO will remain in history but cannot be continued."
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
        const response = await fetch(
            "../database/buyer-po-drafts.php",
            {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    action: "cancel",
                    po_number: poNumber
                })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "Unable to cancel this draft."
            );
        }

        window.location.reload();

    } catch (error) {
        console.error(error);

        if (typeof showToast === "function") {
            showToast(error.message);
        }

        button.disabled = false;
    }
});
