/**
 * UniProcur | PR-2026-01 (Edit RFQ) JavaScript
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const toast = document.getElementById("toast");
  const backButton = document.getElementById("backButton");
  const selectedCountBadge = document.getElementById("selectedSuppliersCount");
  const reviewSubmitBtn = document.getElementById("reviewSubmitBtn");
  const reviewModal = document.getElementById("reviewModal");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalConfirmBtn = document.getElementById("modalConfirmBtn");
  const dropzone = document.getElementById("attachmentDropzone");
  const fileInput = document.getElementById("fileInput");
  const filesList = document.getElementById("uploadedFilesList");
  const ampmButtons = document.querySelectorAll(".ampm-btn");
  const rfqParams = new URLSearchParams(window.location.search);
  const requestedPrNumber = rfqParams.get("pr_number");

  let toastTimer;
  let attachedFiles = [];
  let purchaseRequestReady = !requestedPrNumber;

  // ==========================================================================
  // Toast Helper
  // ==========================================================================
  function showToast(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add("is-visible");

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2800);
  }

  // ==========================================================================
  // Session Check Integration
  // ==========================================================================
  async function loadUserSession() {
    try {
      const response = await fetch("../database/check-session.php", {
        method: "GET",
        credentials: "same-origin"
      });

      if (!response.ok) return;

      const data = await response.json();
      if (data.authenticated && data.user) {
        const nameEl = document.getElementById("loggedInName");
        const emailEl = document.getElementById("loggedInEmail");
        const avatarEl = document.getElementById("loggedInAvatar");

        if (nameEl && data.user.full_name) {
          nameEl.textContent = data.user.full_name;
        }
        if (emailEl && data.user.email) {
          emailEl.textContent = data.user.email;
        }
        if (avatarEl && data.user.full_name) {
          avatarEl.textContent = data.user.full_name.trim().charAt(0).toUpperCase();
        }
      }
    } catch (err) {
      console.warn("Session check unavailable; using default buyer profile:", err);
    }
  }

  loadUserSession();

  function formatPurchaseRequestDate(value) {
    if (!value) return "—";

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "long",
      day: "2-digit"
    }).format(date);
  }

  function renderPurchaseRequestItems(items) {
    const productsColumn = document.querySelector(".products-column");
    const justification = productsColumn?.querySelector(".justification-box");
    if (!productsColumn || !justification) return;

    productsColumn.querySelectorAll(".product-item").forEach((item) => item.remove());

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "product-item";

      const thumb = document.createElement("div");
      thumb.className = "product-thumb";

      const imagePath =
        window.resolveProcurementProductImage(item.item_name);
      if (imagePath) {
        const image = document.createElement("img");
        image.className = "product-image";
        image.src = imagePath;
        image.alt = item.item_name || "Requested product";
        thumb.appendChild(image);
      }

      const info = document.createElement("div");
      info.className = "product-info";

      const title = document.createElement("h3");
      title.textContent = item.item_name || "Unnamed item";

      const categoryRow = document.createElement("div");
      categoryRow.className = "meta-line";
      const categoryLabel = document.createElement("span");
      categoryLabel.textContent = "Category:";
      const categoryValue = document.createElement("strong");
      categoryValue.textContent = item.category || "—";
      categoryRow.append(categoryLabel, categoryValue);

      const quantityRow = document.createElement("div");
      quantityRow.className = "meta-line";
      const quantityLabel = document.createElement("span");
      quantityLabel.textContent = "Qty:";
      const quantityValue = document.createElement("strong");
      quantityValue.textContent =
        `${item.qty ?? "—"} ${item.unit || ""}`.trim();
      quantityRow.append(quantityLabel, quantityValue);

      info.append(title, categoryRow, quantityRow);
      card.append(thumb, info);
      productsColumn.insertBefore(card, justification);
    });
  }

  async function loadPurchaseRequestContext() {
    if (!requestedPrNumber) return;

    if (reviewSubmitBtn) reviewSubmitBtn.disabled = true;

    try {
      const response = await fetch(
        `../database/get-purchase-request.php?pr_number=${encodeURIComponent(requestedPrNumber)}`,
        {
          method: "GET",
          credentials: "same-origin",
          headers: { "Accept": "application/json" }
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load the selected Purchase Request.");
      }

      const pr = result.purchase_request;
      const metadata = document.querySelectorAll(
        ".metadata-row .metadata-item strong"
      );
      if (metadata[0]) metadata[0].textContent = pr.pr_number;
      if (metadata[1]) metadata[1].textContent = formatPurchaseRequestDate(pr.needed_by);

      const requestedPrId = rfqParams.get("pr_id");
      if (requestedPrId && String(pr.id) !== requestedPrId) {
        throw new Error("The selected Purchase Request does not match.");
      }

      renderPurchaseRequestItems(Array.isArray(result.items) ? result.items : []);

      const purpose = document.querySelector(".justification-box p");
      if (purpose) purpose.textContent = pr.purpose || "No purpose provided.";

      document.title = `Create RFQ | ${pr.pr_number}`;
      purchaseRequestReady = true;
      if (reviewSubmitBtn) reviewSubmitBtn.disabled = false;
    } catch (error) {
      console.error("Selected Purchase Request loading error:", error);
      showToast(error.message || "Unable to load the selected Purchase Request.");
    }
  }

  loadPurchaseRequestContext();

  // ==========================================================================
  // Navigation
  // ==========================================================================
  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "../buyerdashboard/create-rfq.html";
    });
  }

  // Notification bell click
  const notifBtn = document.querySelector(".notification-button");
  if (notifBtn) {
    notifBtn.addEventListener("click", () => {
      showToast("No new notifications.");
    });
  }

  // ==========================================================================
  // Supplier Selection Toggle
  // ==========================================================================
 

function updateSelectedCount() {
  const selectedCards = document.querySelectorAll(
    ".supplier-selection-card.is-selected"
  );

  if (selectedCountBadge) {
    selectedCountBadge.textContent = String(selectedCards.length);
  }
}




document.querySelectorAll(".supplier-selection-card").forEach((card) => {
  const toggleBtn = card.querySelector(".supplier-toggle-btn");
  const cardBody = card.querySelector(".supplier-card-body");

  if (!toggleBtn || !cardBody) return;

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "supplier-cancel-btn";
  cancelBtn.textContent = "Cancel";
  cardBody.appendChild(cancelBtn);

  function updateCard() {
    const selected = card.classList.contains("is-selected");

    toggleBtn.classList.toggle("is-selected", selected);
    toggleBtn.textContent = selected ? "Selected" : "Select";
    cancelBtn.hidden = !selected;

    updateSelectedCount();
  }

  function toggleCard() {
    card.classList.toggle("is-selected");
    updateCard();
  }

  toggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleCard();
  });

  cancelBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    card.classList.remove("is-selected");
    updateCard();
  });

  card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    toggleCard();
  });

  updateCard();
});


  // Initial count update
  updateSelectedCount();

  // ==========================================================================
  // AM / PM Toggle
  // ==========================================================================
  ampmButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      ampmButtons.forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-checked", "true");
    });
  });

  // ==========================================================================
  // File Upload & Dropzone Handling
  // ==========================================================================
  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("drag-over");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files) {
        handleFiles(fileInput.files);
      }
    });
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function renderFileList() {
    if (!filesList) return;
    filesList.innerHTML = "";

    attachedFiles.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "uploaded-file-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "file-name";
      nameSpan.textContent = `${file.name} (${formatBytes(file.size)})`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "file-remove-btn";
      removeBtn.setAttribute("aria-label", `Remove ${file.name}`);
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        attachedFiles.splice(index, 1);
        renderFileList();
        showToast("Attachment removed.");
      });

      li.append(nameSpan, removeBtn);
      filesList.appendChild(li);
    });
  }

  function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 25 * 1024 * 1024) {
        showToast(`File "${file.name}" exceeds the 25MB limit.`);
        continue;
      }
      attachedFiles.push(file);
    }
    renderFileList();
    if (files.length > 0) {
      showToast(`${files.length} attachment(s) added.`);
    }
  }

 
 

     
  // =====================================
  // REVIEW MODAL AND DATA HANDOFF
  // =====================================

  const modalSuppliersCount =
    document.getElementById("modalSuppliersCount");

  const modalDeadline =
    document.getElementById("modalDeadline");

  const modalLocation =
    document.getElementById("modalLocation");

  const modalAttachmentCount =
    document.getElementById("modalAttachmentCount");


  // Get currently selected suppliers.
  function getSelectedSupplierCards() {

    return Array.from(
      document.querySelectorAll(
        ".supplier-selection-card.is-selected"
      )
    );

  }


 if (reviewSubmitBtn) {
  reviewSubmitBtn.addEventListener("click", (event) => {
    event.preventDefault();

    if (!purchaseRequestReady) {
      showToast("Wait for the selected Purchase Request to finish loading.");
      return;
    }

    const previewData = collectRfqPreviewData();

    if (previewData.products.length === 0) {
      showToast("No requested products found.");
      return;
    }

    if (previewData.suppliers.length === 0) {
      showToast("Please select at least one supplier.");
      return;
    }

    try {
      sessionStorage.setItem(
        "uniprocur_rfq_preview",
        JSON.stringify(previewData)
      );

      console.log("RFQ preview successfully saved:", previewData);
      console.log(
        "Selected warehouse:",
        previewData.warehouseValue
      );

    } catch (error) {
      console.error("Unable to save RFQ preview:", error);
      showToast("Unable to save RFQ information.");
      return;
    }

    // Update review modal summary.
    if (modalSuppliersCount) {
      modalSuppliersCount.textContent =
        `${previewData.suppliers.length} suppliers`;
    }

    if (modalDeadline) {
      modalDeadline.textContent =
        `${previewData.submissionDueDate} at ${previewData.requiredTime} ${previewData.ampm}`;
    }

    if (modalLocation) {
      modalLocation.textContent = previewData.warehouseText;
    }

    if (modalAttachmentCount) {
      modalAttachmentCount.textContent =
        previewData.attachments.length > 0
          ? `${previewData.attachments.length} file(s)`
          : "None";
    }

   
window.location.href = "confirm-rfq.html";

    });
  }



  // Close review modal.
  if (modalCloseBtn && reviewModal) {
    modalCloseBtn.addEventListener("click", () => {
      reviewModal.close();
    });
  }

  if (modalCancelBtn && reviewModal) {
    modalCancelBtn.addEventListener("click", () => {
      reviewModal.close();
    });
  }


  // =====================================
  // DATE CONVERSION
  // =====================================

  function convertDateToISO(value) {

    if (!value) {
      return "2026-10-05";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "2026-10-05";
    }

    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;

  }


  // =====================================
  // PRODUCT DATA
  // =====================================

  function getProductMeta(card, label) {

    const rows = Array.from(
      card.querySelectorAll(".meta-line")
    );

    const matchingRow = rows.find((row) => {

      const rowLabel =
        row.querySelector("span")?.textContent.trim() || "";

      return rowLabel.toLowerCase().startsWith(
        label.toLowerCase()
      );

    });

    if (!matchingRow) {
      return "";
    }

    const valueElement =
      matchingRow.querySelector("strong, p");

    return valueElement?.textContent.trim() || "";

  }


  function collectProducts() {

    return Array.from(
      document.querySelectorAll(".product-item")
    ).map((card) => {

      const name =
        card.querySelector(
          ".product-info h3"
        )?.textContent.trim() || "";

      const imagePath =
        card.querySelector(
          ".product-image"
        )?.getAttribute("src") || "";

      const imageName =
        imagePath.split("/").pop();

      return {

        name: name,

        category: getProductMeta(card, "Category"),

        quantity: getProductMeta(card, "Qty"),

        description: getProductMeta(card, "Description"),

        image:
          window.resolveProcurementProductImage(name, imageName)
            .split("/")
            .pop()

      };

    });

  }


  // =====================================
  // SUPPLIER DATA
  // =====================================

  function collectSuppliers() {

    return getSelectedSupplierCards().map((card) => {

      const metrics = Array.from(
        card.querySelectorAll(
          ".metrics-row .metric strong"
        )
      ).map((element) => {

        return element.textContent.trim();

      });


      return {

        key: card.dataset.supplier || "",

        name:
          card.querySelector(
            ".supplier-card-body h3"
          )?.textContent.trim() || "",

        city:
          card.querySelector(
            ".supplier-city"
          )?.textContent.trim() || "",

        rating:
          (metrics[0] || "").replace(/^★\s*/, "").trim(),

        leadTime: metrics[1] || "",

        paymentTerms: metrics[2] || ""

      };

    });

  }


  // =====================================
  // BUILD RFQ PREVIEW DATA
  // =====================================

  function collectRfqPreviewData() {

    const metadataItems = Array.from(
      document.querySelectorAll(
        ".metadata-row .metadata-item"
      )
    );

    const prNumber =
      metadataItems[0]?.querySelector("strong")
        ?.textContent.trim() || "PR-2026-01";

    const prRequiredDateText =
      metadataItems[1]?.querySelector("strong")
        ?.textContent.trim() || "October 05, 2026";


    const submissionDate =
      document.getElementById("submissionDate");

    const submissionTime =
      document.getElementById("submissionTime");

    const ampmButton =
      document.querySelector(".ampm-btn.is-active");

    const warehouseSelect =
      document.getElementById("warehouseLocation");


    const warehouseValue =
      warehouseSelect?.value === "second"
        ? "second"
        : "main";

    const warehouseText =
      warehouseSelect?.options[
        warehouseSelect.selectedIndex
      ]?.text.trim() ||
      "Main Warehouse — Brgy. II-C, San Pablo City, Laguna";


    const justification =
      document.querySelector(
        ".justification-box p"
      )?.textContent.trim() || "";


    const products = collectProducts();

    const suppliers = collectSuppliers();


    // Get buyer information when available.
    const buyerName =
      document.getElementById("loggedInName")
        ?.textContent.trim() ||
      "Clark Almeda";

    const buyerEmail =
      document.getElementById("loggedInEmail")
        ?.textContent.trim() ||
      "buyer@company.com";


    // Generate a preview number from the PR number.
    const prSuffix =
      prNumber.match(/(\d+)$/)?.[1] || "1";

    const rfqNumber =
      `RFQ-${prSuffix.padStart(4, "0")}`;


    // Save attachment information.
    // Actual file contents will be uploaded to the backend later.
    const attachments = attachedFiles.map((file) => ({

      name: file.name,

      size: file.size,

      type: file.type

    }));


    return {

      rfqNumber,

      prNumber,

      prRequiredDate:
        convertDateToISO(prRequiredDateText),

      submissionDueDate:
        submissionDate?.value || "2026-09-30",

      requiredTime:
        submissionTime?.value || "05:00",

      ampm:
        ampmButton?.dataset.ampm || "PM",

      // Important: preserve the selected warehouse.
      warehouseValue,

      warehouseText,

      justification,

      products,

      suppliers,

      attachments,

      buyerName,

      buyerEmail

    };

  }


  // =====================================
  // CONFIRM AND OPEN CONFIRM RFQ PAGE
  // =====================================

  if (modalConfirmBtn) {
  modalConfirmBtn.addEventListener("click", (event) => {
    event.preventDefault();

    const savedData = sessionStorage.getItem(
      "uniprocur_rfq_preview"
    );

    if (!savedData) {
      showToast("RFQ information was not saved. Please try again.");
      return;
    }

    if (reviewModal) {
      reviewModal.close();
    }

    window.location.href = "confirm-rfq.html";
  });
}



  // =====================================
  // LEAFLET WAREHOUSE MAP
  // Same coordinates as edit-rfq2.
  // This is inside the existing DOMContentLoaded.
  // =====================================

  const mapElement =
    document.getElementById("deliveryMap");

  const warehouseSelect =
    document.getElementById("warehouseLocation");

  const mapTag =
    document.querySelector(".map-tag");


  if (mapElement && typeof window.L === "undefined") {

    console.error(
      "Leaflet did not load. Check your internet connection."
    );

  } else if (mapElement && !mapElement._leaflet_id) {

    const warehouseLocations = {

      main: {

        coordinates: [
          14.0657265,
          121.3223515
        ],

        label:
          "Main Warehouse — Brgy. II-C, San Pablo City, Laguna"

      },

      second: {

        coordinates: [
          14.1398816,
          121.4206179
        ],

        label:
          "Second Warehouse — Palina, Nagcarlan, Laguna"

      }

    };


    // Get selected warehouse.
    const selectedWarehouse =
      warehouseLocations[warehouseSelect?.value] ||
      warehouseLocations.main;


    // Initialize Leaflet.
    const map = window.L.map(
      mapElement
    ).setView(
      selectedWarehouse.coordinates,
      15
    );


    // OpenStreetMap tiles.
    window.L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }
    ).addTo(map);


    // Warehouse marker.
    const marker = window.L.marker(
      selectedWarehouse.coordinates
    )
      .addTo(map)
      .bindPopup(selectedWarehouse.label);


    // Warehouse label.
    if (mapTag) {
      mapTag.textContent = selectedWarehouse.label;
    }


    // Update map when warehouse changes.
    if (warehouseSelect) {

      warehouseSelect.addEventListener("change", () => {

        const selectedLocation =
          warehouseLocations[warehouseSelect.value];

        if (!selectedLocation) {
          return;
        }

        map.flyTo(
          selectedLocation.coordinates,
          15
        );

        marker.setLatLng(
          selectedLocation.coordinates
        );

        marker.setPopupContent(
          selectedLocation.label
        );

        marker.setTooltipContent?.(
          selectedLocation.label
        );

        if (mapTag) {
          mapTag.textContent = selectedLocation.label;
        }

      });

    }


    // Refresh Leaflet dimensions.
    requestAnimationFrame(() => {
      map.invalidateSize(true);
    });


    window.addEventListener("resize", () => {
      map.invalidateSize(true);
    });


    console.log("Edit RFQ warehouse map initialized.");

  }

});
