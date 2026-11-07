
"use strict";

(() => {
    // ========================================
    // 1. GET RFQ INFORMATION FROM URL
    // ========================================

    const params = new URLSearchParams(location.search);
    const rfqNumber = params.get("rfq_number");
    const selectedId = Number(params.get("quote_id"));

    const byId = id => document.getElementById(id);

    const currency = value => {
        return new Intl.NumberFormat("en-PH", {
            style: "currency",
            currency: "PHP"
        }).format(Number(value) || 0);
    };

    // ========================================
    // 2. COMPLETE PRODUCT IMAGE MAPPING
    // ========================================

    const productImages = {
        // Leather
        "full-grain leather": "../assets/catalog/full-grain-leather.png",
        "black leather": "../assets/black%20leather.svg",
        "nubuck leather": "../assets/catalog/nubuck-leather.png",

        // Textile and Synthetic
        "mesh fabric": "../assets/catalog/mesh-fabric.png",
        "canvas fabric": "../assets/catalog/canvas-fabric.png",
        "pu leather": "../assets/catalog/pu-leather.png",

        // Components
        "rubber sole": "../assets/catalog/vulcanized-rubber-outsoles.png",
        "eva foam sheets": "../assets/catalog/eva-foam-sheets.png",
        "foam insole": "../assets/foam%20insole.svg",

        // Hardware
        "metal eyelets": "../assets/catalog/metal-eyelets.png",
        "metal buckles": "../assets/catalog/metal-buckles.png",
        "shoelaces": "../assets/shoe%20laces.svg",

        // Packaging
        "shoe boxes": "../assets/catalog/shoe-boxes.png",
        "shoe boxes (eco friendly)": "../assets/catalog/shoe-boxes.png",
        "tissue paper rolls": "../assets/catalog/tissue-paper-rolls.png",
        "packaging tape": "../assets/catalog/packaging-tape.png",

        // Adhesive
        "shoe adhesive": "../assets/shoe%20adhesive.svg",

        // Older materials for historical RFQs
        "suede leather": "../assets/catalog/suede-leather.png",
        "tpr outsoles": "../assets/catalog/tpr-outsoles.png",
        "zippers": "../assets/catalog/zippers.png",
        "vulcanized rubber outsoles": "../assets/catalog/vulcanized-rubber-outsoles.png",
        "rubber cement": "../assets/catalog/rubber-cement.png",
        "rubber cement / shoe adhesive": "../assets/catalog/rubber-cement.png"
    };

    // ========================================
    // 3. SUPPLIER IMAGES AND LOCATIONS
    // ========================================

    const supplierImage = name => {
        const n = (name || "").toLowerCase();

        if (n.includes("synthhide")) return "synthide.svg";
        if (n.includes("cordillera")) return "cordillera.svg";
        if (n.includes("marikina")) return "marikina.svg";
        if (n.includes("soletech")) return "soletech.svg";
        if (n.includes("metalcraft")) return "metalcraft.svg";

        return "ecobox.svg";
    };

    const locationMap = {
        synthhide: "Cavite Economic Zone, Cavite",
        marikina: "Marikina City, Metro Manila",
        cordillera: "Baguio City, Benguet",
        soletech: "Valenzuela City, Metro Manila",
        metalcraft: "Caloocan City, Metro Manila",
        ecobox: "Laguna Technopark, Laguna"
    };

    const supplierLocation = name => {
        const n = (name || "").toLowerCase().replace(/\s+/g, "");

        const key = Object.keys(locationMap).find(k => n.includes(k));

        return key ? locationMap[key] : "Location not available";
    };

    // ========================================
    // 4. HELPER FUNCTIONS
    // ========================================

    const mk = (tag, cls, txt) => {
        const element = document.createElement(tag);

        if (cls) {
            element.className = cls;
        }

        if (txt !== undefined) {
            element.textContent = String(txt);
        }

        return element;
    };

    const set = (id, value) => {
        byId(id).textContent = value;
    };

    // ========================================
    // 5. BACK AND CANCEL LINKS
    // ========================================

    const comparisonUrl =
        `comparison-matrix.html?rfq_number=${encodeURIComponent(rfqNumber || "")}`;

    byId("backLink").href = comparisonUrl;
    byId("cancelLink").href = comparisonUrl;

    const status = byId("status");

    if (!rfqNumber || !Number.isInteger(selectedId) || selectedId <= 0) {
        status.textContent =
            "RFQ number or selected supplier is missing.";

        status.classList.add("error");
        return;
    }

    let selected = null;

    // ========================================
    // 6. DISPLAY PRODUCT CARDS
    // ========================================

    function productCard(item) {
        const card = mk("article", "product");
        const image = mk("div", "product-image");
        const img = mk("img");

        // Get the correct image based on item name
        const itemKey = String(item.item_name || "")
            .trim()
            .toLowerCase();

        img.src = productImages[itemKey] ||
            "../assets/catalog/brand-outline.svg";

        img.alt = item.item_name;

        image.append(
            img,
            mk("span", "item-tag", item.item_name)
        );

        const content = mk("div", "product-detail");

        const fields = [
            ["Qty:", `${Number(item.qty)} ${item.unit}`],
            ["Unit Price:", `${currency(item.unit_price)} / ${item.unit}`],
            ["Total:", currency(item.subtotal)]
        ];

        fields.forEach(([label, value]) => {
            const row = mk("div", "item-field");

            row.append(
                mk("strong", "", label),
                mk("span", "", value)
            );

            content.append(row);
        });

        card.append(image, content);

        return card;
    }

    // ========================================
    // 7. LOAD SAVED RFQ QUOTATIONS
    // ========================================

    async function load() {
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
                    data.message || "Unable to retrieve comparison."
                );
            }

            selected = (data.suppliers || []).find(
                supplier => Number(supplier.quote_id) === selectedId
            );

            if (!selected) {
                throw new Error(
                    "The selected supplier is not part of this RFQ."
                );
            }

            if (
                selected.total_amount === null ||
                !(selected.items || []).length
            ) {
                throw new Error(
                    "This supplier quotation has not been saved yet."
                );
            }

            // Display RFQ and supplier information
            set("headerNumber", data.rfq.rfq_number);
            set("supplierName", selected.name);
            set(
                "supplierLocation",
                supplierLocation(selected.name)
            );

            set(
                "supplierRating",
                selected.rating
                    ? "★ " + selected.rating
                    : "Not rated"
            );

            // Display supplier summary
            set("summarySupplier", selected.name);
            set(
                "summaryLocation",
                supplierLocation(selected.name)
            );

            set("summaryContact", "Supplier");

            set(
                "totalValue",
                currency(selected.total_amount)
            );

            set(
                "leadValue",
                selected.lead_time_days
                    ? `${selected.lead_time_days} days`
                    : "—"
            );

            set(
                "paymentValue",
                selected.payment_terms || "—"
            );

            // Display supplier banner
            byId("supplierBanner").style.backgroundImage =
                `url("../assets/${supplierImage(selected.name)}")`;

            // Display product cards
            byId("products").replaceChildren(
                ...selected.items.map(productCard)
            );

            status.textContent = "";

            // Prevent awarding the same RFQ twice
            if (data.rfq.status === "awarded") {
                status.textContent =
                    "This RFQ has already been awarded. Awarding again is disabled.";

                return;
            }

            // RFQ must be compared before awarding
            if (data.rfq.status !== "compared") {
                status.textContent =
                    "Save and Compare the quotations before awarding.";

                return;
            }

            // Enable Award RFQ button
            byId("awardButton").disabled = false;

        } catch (error) {
            status.textContent = error.message;
            status.classList.add("error");

            console.error(error);
        }
    }

    // ========================================
    // 8. AWARD RFQ BUTTON
    // ========================================

    byId("awardButton").addEventListener("click", async () => {

        if (!selected) {
            return;
        }

        // Confirm awarding the selected supplier
        const confirmed = confirm(
            `Award ${rfqNumber} to ${selected.name} for ` +
            `${currency(selected.total_amount)}? ` +
            "This will record the winning supplier."
        );

        if (!confirmed) {
            return;
        }

        const btn = byId("awardButton");

        btn.disabled = true;
        btn.textContent = "Awarding...";

        try {
            // Send award request to PHP
            const response = await fetch(
                "../database/award-rfq.php",
                {
                    method: "POST",
                    credentials: "same-origin",

                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json"
                    },

                    body: JSON.stringify({
                        rfq_number: rfqNumber,
                        quote_id: selectedId
                    })
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Unable to award supplier."
                );
            }

            // ========================================
            // 9. SUCCESSFUL AWARD
            // ========================================

            status.classList.remove("error");
            status.classList.add("success");

            status.textContent =
                `${selected.name} has been awarded ${rfqNumber}. ` +
                "Supplier response is simulated; no external message has been sent.";

            btn.textContent = "Awarded ✓";

            byId("nextContent").innerHTML = `
                <p>
                    <strong>RFQ Awarded Successfully!</strong>
                </p>

                <p>
                    The winning quotation is saved in MySQL.
                    The next implementation stage is Purchase Order
                    creation and Manager approval.
                </p>

                <p class="note">
                    No Purchase Order has been created automatically.
                </p>
            `;

            // ========================================
            // 10. SHOW SUCCESS POPUP
            // ========================================

            const successModal = byId("awardSuccessModal");

            if (successModal) {
                byId("successRfqNumber").textContent = rfqNumber;
                byId("successSupplierName").textContent = selected.name;

                successModal.hidden = false;

                // Prevent scrolling while popup is open
                document.body.style.overflow = "hidden";
            }

        } catch (error) {
            status.classList.add("error");
            status.textContent = error.message;

            btn.disabled = false;

            // Restore Award RFQ button with SVG icon
            btn.replaceChildren();

            const icon = document.createElement("img");

            icon.src = "../assets/award.svg";
            icon.alt = "";
            icon.className = "award-icon";

            btn.append(
                icon,
                document.createTextNode(" Award RFQ")
            );

            console.error(error);
        }
    });

    // ========================================
    // 11. INITIALIZE PAGE
    // ========================================

    load();

})();
