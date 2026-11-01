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
  const successModal = document.getElementById("successModal");
  const backToDashboardBtn = document.getElementById("backToDashboardBtn");
  const dropzone = document.getElementById("attachmentDropzone");
  const fileInput = document.getElementById("fileInput");
  const filesList = document.getElementById("uploadedFilesList");
  const ampmButtons = document.querySelectorAll(".ampm-btn");

  let toastTimer;
  let attachedFiles = [];

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

  // ==========================================================================
  // Navigation
  // ==========================================================================
  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "PR202601.html";
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
    const selectedCards = document.querySelectorAll(".supplier-selection-card.is-selected");
    const count = selectedCards.length;
    if (selectedCountBadge) {
      selectedCountBadge.textContent = String(count);
    }
  }

  document.querySelectorAll(".supplier-selection-card").forEach((card) => {
    const toggleBtn = card.querySelector(".supplier-toggle-btn");

    function toggleCard() {
      const isCurrentlySelected = card.classList.contains("is-selected");

      if (isCurrentlySelected) {
        card.classList.remove("is-selected");
        toggleBtn.classList.remove("is-selected");
        toggleBtn.innerHTML = "Select";
      } else {
        card.classList.add("is-selected");
        toggleBtn.classList.add("is-selected");
        toggleBtn.innerHTML = '<span class="check-icon" aria-hidden="true">✓</span> Selected';
      }

      updateSelectedCount();
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleCard();
      });
    }

    card.addEventListener("click", (e) => {
      // Avoid re-triggering if clicked directly on button
      if (e.target.closest(".supplier-toggle-btn")) return;
      toggleCard();
    });
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

  // ==========================================================================
  // Review & Submit RFQ Flow
  // ==========================================================================
  
// =========================================
// REVIEW & SUBMIT RFQ
// Pass selected RFQ information to Confirm RFQ.
// =========================================

if (reviewSubmitBtn) {

  reviewSubmitBtn.addEventListener("click", () => {

    // Get Purchase Request metadata.
    const metadataItems = document.querySelectorAll(
      ".metadata-row .metadata-item"
    );

    const prNumber =
      metadataItems[0]?.querySelector("strong")?.textContent.trim()
      || "PR-2026-01";

    const prRequiredDate =
      metadataItems[1]?.querySelector("strong")?.textContent.trim()
      || "October 05, 2026";


    // Convert the PR date into YYYY-MM-DD.
    function convertDateToISO(value) {

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


    // Get the RFQ deadline.
    const submissionDate =
      document.getElementById("submissionDate")?.value || "";

    const submissionTime =
      document.getElementById("submissionTime")?.value || "05:00";

    const activeAmpm =
      document.querySelector(".ampm-btn.is-active")?.dataset.ampm || "PM";


    // Get selected warehouse.
    const warehouseSelect =
      document.getElementById("warehouseLocation");

    const warehouseValue =
      warehouseSelect?.value || "main";

    const warehouseText =
      warehouseSelect?.options[
        warehouseSelect.selectedIndex
      ]?.text.trim() ||
      "Main Warehouse — Brgy. II-C, San Pablo City, Laguna";


    // Get product metadata.
    function getProductMeta(card, label) {

      const rows = card.querySelectorAll(".meta-line");

      for (const row of rows) {

        const rowLabel =
          row.querySelector("span")?.textContent.trim() || "";

        if (
          rowLabel.toLowerCase().startsWith(label.toLowerCase())
        ) {

          return (
            row.querySelector("strong, p")?.textContent.trim() || ""
          );

        }

      }

      return "";
    }


    // Get every requested product.
    const products = Array.from(
      document.querySelectorAll(".product-item")
    ).map((card) => {

      const name =
        card.querySelector(".product-info h3")?.textContent.trim() || "";

      const imagePath =
        card.querySelector(".product-image")?.getAttribute("src") || "";

      const imageName = imagePath.split("/").pop();

      return {

        name,

        category: getProductMeta(card, "Category"),

        quantity: getProductMeta(card, "Qty"),

        description: getProductMeta(card, "Description"),

        image: imageName === "mesh.svg"
          ? "mesh.svg"
          : "leather.svg"

      };

    });


    // Get only suppliers currently selected.
    const suppliers = Array.from(
      document.querySelectorAll(
        ".supplier-selection-card.is-selected"
      )
    ).map((card) => {

      const metrics = Array.from(
        card.querySelectorAll(".metric strong")
      ).map((metric) => metric.textContent.trim());

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
          (metrics[0] || "").replace(/^★\s*/, ""),

        leadTime: metrics[1] || "",

        paymentTerms: metrics[2] || ""

      };

    });


    // Get justification.
    const justification =
      document.querySelector(
        ".justification-box p"
      )?.textContent.trim() || "";


    // Get attachments.
    const attachments = attachedFiles.map((file) => ({

      name: file.name,

      size: file.size

    }));


    // Get buyer information.
    const buyerName =
      document.getElementById("loggedInName")?.textContent.trim() ||
      "Clark Alameda";

    const buyerEmail =
      document.getElementById("loggedInEmail")?.textContent.trim() ||
      "buyer@company.com";


    // Generate a preview RFQ number from the PR number.
    const prSuffix = prNumber.match(/(\d+)$/)?.[1] || "1";

    const rfqNumber =
      `RFQ-${prSuffix.padStart(4, "0")}`;


    // Prepare everything for the confirmation page.
    const previewData = {

      rfqNumber,

      prNumber,

      prRequiredDate:
        convertDateToISO(prRequiredDate),

      submissionDueDate:
        submissionDate,

      requiredTime:
        submissionTime,

      ampm:
        activeAmpm,

      warehouseValue,

      warehouseText,

      justification,

      products,

      suppliers,

      attachments,

      buyerName,

      buyerEmail

    };


    // Do not continue without products or selected suppliers.
    if (products.length === 0) {
      showToast("No requested products found.");
      return;
    }

    if (suppliers.length === 0) {
      showToast("Please select at least one supplier.");
      return;
    }


    // Save preview data for the next page.
    sessionStorage.setItem(
      "uniprocur_rfq_preview",
      JSON.stringify(previewData)
    );


    // Open Confirm RFQ.
    window.location.href = "confirm-rfq.html";

  });

}


      // Populate modal summary
      const modalSuppliersCount = document.getElementById("modalSuppliersCount");
      const modalDeadline = document.getElementById("modalDeadline");
      const modalLocation = document.getElementById("modalLocation");
      const modalAttachmentCount = document.getElementById("modalAttachmentCount");

      const dateVal = document.getElementById("submissionDate")?.value || "2026-09-30";
      const timeVal = document.getElementById("submissionTime")?.value || "05:00";
      const activeAmpm = document.querySelector(".ampm-btn.is-active")?.textContent || "PM";
      const locationSelect = document.getElementById("warehouseLocation");
      const locationText = locationSelect?.options[locationSelect.selectedIndex]?.text || "San Pedro City";

      if (modalSuppliersCount) {
        modalSuppliersCount.textContent = `${selectedCards.length} supplier${selectedCards.length > 1 ? "s" : ""}`;
      }
      if (modalDeadline) {
        modalDeadline.textContent = `${dateVal} at ${timeVal} ${activeAmpm}`;
      }
      if (modalLocation) {
        modalLocation.textContent = locationText;
      }
      if (modalAttachmentCount) {
        modalAttachmentCount.textContent = attachedFiles.length > 0
          ? `${attachedFiles.length} file(s)`
          : "None";
      }

      reviewModal.showModal();
    });

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener("click", () => reviewModal.close());
    }

    if (modalCancelBtn) {
      modalCancelBtn.addEventListener("click", () => reviewModal.close());
    }


// Return to the Buyer Dashboard
if (backToDashboardBtn) {
  backToDashboardBtn.addEventListener("click", () => {
    window.location.href = "../buyerdashboard/buyer-dashboard.html";
  });
}





 // Proceed to Confirm: show the success modal
if (modalConfirmBtn && reviewModal && successModal) {
  modalConfirmBtn.addEventListener("click", () => {
    reviewModal.close();
    successModal.showModal();
  });
}
  }
});



/* ======================MAP===================================================
   Delivery Map — Leaflet + OpenStreetMap
   ========================================================================== */



/* =========================================================
   DELIVERY MAP — edit-rfq.js
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {
  console.log("1. RFQ map script is running.");

  const mapElement = document.getElementById("deliveryMap");
  const warehouseSelect = document.getElementById("warehouseLocation");
  const mapTag = document.querySelector(".map-tag");

  // Check required HTML elements.
  if (!mapElement || !warehouseSelect) {
    console.error("ERROR: Map element or warehouse dropdown is missing.");
    return;
  }

  // Check Leaflet.
  if (typeof L === "undefined") {
    console.error("ERROR: Leaflet did not load.");
    return;
  }

  // Warehouse locations.
  const warehouses = {
    main: {
      name: "Main Warehouse — San Pablo City, Laguna",
      coordinates: [14.0657265, 121.3223515]
    },
    second: {
      name: "Second Warehouse — Nagcarlan, Laguna",
      coordinates: [14.1398816, 121.4206179]
    }
  };

  const startingLocation =
    warehouses[warehouseSelect.value] || warehouses.main;

  // Create the map.
  const map = L.map(mapElement).setView(
    startingLocation.coordinates,
    15
  );

  // Load OpenStreetMap tiles.
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(map);

  // Create the warehouse marker.
  const marker = L.marker(startingLocation.coordinates).addTo(map);
  marker.bindPopup(startingLocation.name);

  if (mapTag) {
    mapTag.textContent = startingLocation.name;
  }

  console.log("2. Map initialized at:", startingLocation.name);

  // Respond when the warehouse dropdown changes.
  warehouseSelect.addEventListener("change", function () {
    const selectedValue = warehouseSelect.value;

    console.log("3. Dropdown changed to:", selectedValue);

    const selectedWarehouse = warehouses[selectedValue];

    if (!selectedWarehouse) {
      console.error("ERROR: Unknown warehouse value:", selectedValue);
      return;
    }

    // Move the map and marker.
   // Smoothly fly to the selected warehouse.
map.flyTo(selectedWarehouse.coordinates, 15, {
  animate: true,
  duration: 1.5,
  easeLinearity: 0.25
});

    marker.setLatLng(selectedWarehouse.coordinates);
    marker.setPopupContent(selectedWarehouse.name);

    if (mapTag) {
      mapTag.textContent = selectedWarehouse.name;
    }

    

    console.log(
      "4. Map moved to:",
      selectedWarehouse.name,
      selectedWarehouse.coordinates
    );
  });

  // Correct map rendering after the page layout finishes.
  setTimeout(function () {
    map.invalidateSize(true);
  }, 500);
});


// Back to Edit RFQ 2
const backToEditBtn = document.getElementById("backToEditBtn");

if (backToEditBtn) {
  backToEditBtn.addEventListener("click", function () {
    window.location.href = "edit-rfq2.html";
  });
}