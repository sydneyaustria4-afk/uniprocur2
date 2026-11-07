
"use strict";

(() => {
    const button = document.getElementById("compareButton");
    const message = document.getElementById("message");

    const rfqNumber = new URLSearchParams(
        window.location.search
    ).get("rfq_number");

    if (!button || !message || !rfqNumber) {
        return;
    }

    const originalButtonHTML = button.innerHTML;

    // Display errors on the page instead of using alerts
    function showMessage(text, isError = false) {
        message.replaceChildren();
        message.classList.toggle("is-error", isError);

        message.textContent = text;
    }

    // Check whether the RFQ is available
    async function checkRFQ() {
        try {
            const response = await fetch(
                `../database/get-rfq-quotation-data.php?rfq_number=${encodeURIComponent(rfqNumber)}`,
                {
                    credentials: "same-origin"
                }
            );

            const data = await response.json();

            if (
                response.ok &&
                data.success &&
                data.suppliers?.length
            ) {
                button.disabled = false;
                button.removeAttribute("title");
            }

        } catch (error) {
            console.error("RFQ validation error:", error);
        }
    }

    // Save and Compare button
    button.addEventListener("click", async () => {

        if (button.disabled) {
            return;
        }

        button.disabled = true;
        button.textContent = "Saving...";

        showMessage("Saving supplier quotations...");

        try {
            const response = await fetch(
                "../database/save-rfq-quotations.php",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        rfq_number: rfqNumber
                    })
                }
            );

            const data = await response.json();

            // Display missing products without a popup
            if (!response.ok || !data.success) {

                let errorMessage = data.message ||
                    "Unable to save quotations.";

                if (Array.isArray(data.missing) && data.missing.length) {
                    errorMessage += "\n\nMissing products:\n";
                    errorMessage += data.missing.join("\n");
                }

                throw new Error(errorMessage);
            }

            // Successfully saved: go directly to Comparison Matrix
            window.location.href =
                `comparison-matrix.html?rfq_number=${encodeURIComponent(rfqNumber)}`;

        } catch (error) {

            console.error("Save quotation error:", error);

            showMessage(error.message, true);

            button.disabled = false;
            button.innerHTML = originalButtonHTML;

            // Scroll to the error message
            message.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }
    });

    checkRFQ();

})();

