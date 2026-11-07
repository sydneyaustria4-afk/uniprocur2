
"use strict";

(() => {
    const $ = id => document.getElementById(id);

    const params = new URLSearchParams(location.search);
    const rfqNumber = params.get("rfq_number");
    const requestedQuoteId = Number(params.get("quote_id"));

    const money = value =>
        new Intl.NumberFormat("en-PH", {
            style: "currency",
            currency: "PHP"
        }).format(Number(value) || 0);

    const set = (id, value) => {
        $(id).textContent = String(value);
    };

    const status = $("status");

    // Back to the selected Award Confirmation
    const previousUrl =
        `award-confirmation.html?rfq_number=${encodeURIComponent(rfqNumber || "")}&quote_id=${encodeURIComponent(requestedQuoteId || "")}`;

    $("backLink").href = previousUrl;
    $("cancelLink").href = previousUrl;

    // ========================================
    // LOAD AWARDED RFQ FROM MYSQL
    // ========================================

    async function load() {

        if (
            !rfqNumber ||
            !Number.isInteger(requestedQuoteId) ||
            requestedQuoteId < 1
        ) {
            status.textContent =
                "The RFQ or selected supplier is missing from the URL.";

            status.classList.add("error");
            return;
        }

        try {
            const response = await fetch(
                `../database/get-rfq-comparison.php?rfq_number=${encodeURIComponent(rfqNumber)}`,
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
                    data.message ||
                    "Unable to load RFQ information."
                );
            }

            // Only awarded RFQs can create a PO
            if (data.rfq?.status !== "awarded") {
                throw new Error(
                    "A supplier must be awarded before creating a Purchase Order."
                );
            }

            // Find the actual winning supplier in MySQL
            const winning = (data.suppliers || []).find(
                supplier => Number(supplier.is_winner) === 1
            );

            if (
                !winning ||
                Number(winning.quote_id) !== requestedQuoteId
            ) {
                throw new Error(
                    "The selected quotation is not the awarded supplier for this RFQ."
                );
            }

            if (
                !Array.isArray(winning.items) ||
                !winning.items.length
            ) {
                throw new Error(
                    "The awarded quotation has no saved items."
                );
            }

            // ========================================
            // RFQ AND SUPPLIER INFORMATION
            // ========================================

            set("rfqLabel", data.rfq.rfq_number);
            set("itemsRfqNumber", data.rfq.rfq_number);

            set("supplierName", winning.name || "—");
            set("paymentTerms", winning.payment_terms || "—");

            
// ========================================
// AUTOMATIC DELIVERY INFORMATION FROM RFQ
// ========================================

const warehouseAddresses = {
    main: "Main Warehouse — Brgy. II-C, San Pablo City, Laguna",
    second: "Second Warehouse — Palina, Nagcarlan, Laguna"
};

// Expected Delivery = RFQ submission due date
const expectedDate = data.rfq.deadline || "";

$("expectedDelivery").value =
    /^\d{4}-\d{2}-\d{2}$/.test(expectedDate)
        ? expectedDate
        : "";

$("expectedDelivery").readOnly = true;

// Delivery Address = selected Create RFQ warehouse
const warehouseKey = data.rfq.warehouse_value;

$("deliveryAddress").value =
    warehouseAddresses[warehouseKey] || "";

$("deliveryAddress").readOnly = true;


            // ========================================
            // DISPLAY AWARDED ITEMS
            // ========================================

            const tbody = $("itemRows");
            tbody.replaceChildren();

            winning.items.forEach((item, index) => {

                const tr = document.createElement("tr");

                const values = [
                    index + 1,
                    item.item_name || "—",
                    `${Number(item.qty)} ${item.unit || ""}`,
                    money(item.unit_price),
                    money(item.subtotal)
                ];

                values.forEach(value => {
                    const td = document.createElement("td");
                    td.textContent = String(value);
                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            });

            // ========================================
            // TOTAL CALCULATION (PREVIEW ONLY)
            // ========================================

            const subtotal = Number(winning.total_amount);

            if (!Number.isFinite(subtotal) || subtotal < 0) {
                throw new Error(
                    "The winning quote has an invalid saved total."
                );
            }

            // VAT is illustrative until PO tax settings exist
            const vat = Math.round(
                subtotal * 0.12 * 100
            ) / 100;

            set("subtotal", money(subtotal));
            set("vat", money(vat));
            set("grandTotal", money(subtotal + vat));

            status.textContent =
                "Awarded supplier and RFQ items loaded. " +
                "This is a preview; no Purchase Order has been saved.";

        } catch (error) {
            status.classList.add("error");
            status.textContent = error.message;

            console.error("Create PO preview error:", error);
        }
    }

    load();
})();
