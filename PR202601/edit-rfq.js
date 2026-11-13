
/**
 * UniProcur | PR-2026-01 (Edit RFQ) JavaScript
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

  // ==========================================================================
  // ELEMENTS
  // ==========================================================================

  const toast = document.getElementById("toast");
  const backButton = document.getElementById("backButton");
  const selectedCountBadge = document.getElementById("selectedSuppliersCount");

  const reviewSubmitBtn = document.getElementById("reviewSubmitBtn");
  const reviewModal = document.getElementById("reviewModal");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalConfirmBtn = document.getElementById("modalConfirmBtn");

  const backToDashboardBtn =
    document.getElementById("backToDashboardBtn");

  const dropzone = document.getElementById("attachmentDropzone");
  const fileInput = document.getElementById("fileInput");
  const filesList = document.getElementById("uploadedFilesList");

  const ampmButtons = document.querySelectorAll(".ampm-btn");

  // ONE-CLICK FIX 2026-11-13: validate RFQ date/time BEFORE preview/save.
  const rfqSubmissionDate = document.getElementById("submissionDate");
  const rfqSubmissionTime = document.getElementById("submissionTime");
  function rfqTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function validateRfqSettings() {
    const due = rfqSubmissionDate?.value || "";
    const time = (rfqSubmissionTime?.value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
        !Number.isFinite(Date.parse(`${due}T00:00:00`)) ||
        due < rfqTodayLocal()) {
      showToast("Select a valid RFQ date (today or later).");
      rfqSubmissionDate?.focus();
      return false;
    }
    if (!/^(?:0?[1-9]|1[0-2]):[0-5]\d$/.test(time)) {
      showToast("Use a valid 12-hour time (example: 05:30).");
      rfqSubmissionTime?.setCustomValidity("Enter HH:MM between 01:00 and 12:59.");
      rfqSubmissionTime?.reportValidity();
      rfqSubmissionTime?.focus();
      return false;
    }
    rfqSubmissionTime?.setCustomValidity("");
    return true;
  }
  if (rfqSubmissionDate) {
    rfqSubmissionDate.min = rfqTodayLocal();
    if (rfqSubmissionDate.value && rfqSubmissionDate.value < rfqTodayLocal()) {
      rfqSubmissionDate.value = "";
    }
  }
  if (rfqSubmissionTime) {
    rfqSubmissionTime.addEventListener("input", () => {
      rfqSubmissionTime.value = rfqSubmissionTime.value.replace(/[^0-9:]/g, "").slice(0, 5);
      rfqSubmissionTime.setCustomValidity("");
    });
    rfqSubmissionTime.addEventListener("blur", () => {
      const ok = /^(?:0?[1-9]|1[0-2]):[0-5]\d$/.test(rfqSubmissionTime.value);
      rfqSubmissionTime.setCustomValidity(ok ? "" : "Enter HH:MM between 01:00 and 12:59.");
    });
  }

  let toastTimer;
  let attachedFiles = [];


  // ==========================================================================
  // TOAST HELPER
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
  // SESSION CHECK INTEGRATION
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
          avatarEl.textContent = data.user.full_name
            .trim()
            .charAt(0)
            .toUpperCase();
        }
      }

    } catch (err) {
      console.warn(
        "Session check unavailable; using default buyer profile:",
        err
      );
    }
  }

  loadUserSession();


  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "PR202601.html";
    });
  }

  // Notification bell.
  const notifBtn = document.querySelector(".notification-button");

  if (notifBtn) {
    notifBtn.addEventListener("click", () => {
      showToast("No new notifications.");
    });
  }

  // Back to Buyer Dashboard.
  if (backToDashboardBtn) {
    backToDashboardBtn.addEventListener("click", () => {
      window.location.href =
        "../buyerdashboard/buyer-dashboard.html";
    });
  }


  // ==========================================================================
  // SUPPLIER SELECTION TOGGLE
  // ==========================================================================

  function updateSelectedCount() {
    const selectedCards = document.querySelectorAll(
      ".supplier-selection-card.is-selected"
    );

    const count = selectedCards.length;

    if (selectedCountBadge) {
      selectedCountBadge.textContent = String(count);
    }
  }

  document.querySelectorAll(".supplier-selection-card").forEach((card) => {

    const toggleBtn = card.querySelector(".supplier-toggle-btn");

    function toggleCard() {
      const isCurrentlySelected =
        card.classList.contains("is-selected");

      if (isCurrentlySelected) {
        card.classList.remove("is-selected");

        if (toggleBtn) {
          toggleBtn.classList.remove("is-selected");
          toggleBtn.innerHTML = "Select";
        }

      } else {
        card.classList.add("is-selected");

        if (toggleBtn) {
          toggleBtn.classList.add("is-selected");

          toggleBtn.innerHTML =
            '<span class="check-icon" aria-hidden="true">✓</span> Selected';
        }
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
      if (e.target.closest(".supplier-toggle-btn")) return;

      toggleCard();
    });

  });

  updateSelectedCount();


  // ==========================================================================
  // AM / PM TOGGLE
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
  // FILE UPLOAD AND DROPZONE
  // ==========================================================================

  if (dropzone && fileInput) {

    dropzone.addEventListener("click", () => {
      fileInput.click();
    });

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

    return (
      parseFloat((bytes / Math.pow(k, i)).toFixed(1)) +
      " " +
      sizes[i]
    );

  }


  function renderFileList() {

    if (!filesList) return;

    filesList.innerHTML = "";

    attachedFiles.forEach((file, index) => {

      const li = document.createElement("li");
      li.className = "uploaded-file-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "file-name";

      nameSpan.textContent =
        `${file.name} (${formatBytes(file.size)})`;

      const removeBtn = document.createElement("button");

      removeBtn.type = "button";
      removeBtn.className = "file-remove-btn";

      removeBtn.setAttribute(
        "aria-label",
        `Remove ${file.name}`
      );

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
        showToast(
          `File "${file.name}" exceeds the 25MB limit.`
        );

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
  // REVIEW & SUBMIT RFQ
  // ==========================================================================

  function convertDateToISO(value) {

    if (!value) return "2026-10-05";

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const date = new Date(raw);

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


  if (reviewSubmitBtn) {

    reviewSubmitBtn.addEventListener("click", (event) => {

      event.preventDefault();

      if (!validateRfqSettings()) return;


      // ----------------------------------------------------------------------
      // PURCHASE REQUEST INFORMATION
      // ----------------------------------------------------------------------

      const metadataItems = document.querySelectorAll(
        ".metadata-row .metadata-item"
      );

      const prNumber =
        metadataItems[0]?.querySelector("strong")?.textContent.trim() ||
        "PR-2026-01";

      const prRequiredDate =
        metadataItems[1]?.querySelector("strong")?.textContent.trim() ||
        "October 05, 2026";


      // ----------------------------------------------------------------------
      // RFQ DEADLINE
      // ----------------------------------------------------------------------

      const submissionDate =
        document.getElementById("submissionDate")?.value || "";

      const submissionTime =
        document.getElementById("submissionTime")?.value || "05:00";

      const activeAmpm =
        document.querySelector(".ampm-btn.is-active")
          ?.dataset.ampm || "PM";


      // ----------------------------------------------------------------------
      // WAREHOUSE SELECTION
      // IMPORTANT: SAVE THE ACTUAL SELECTED VALUE.
      // ----------------------------------------------------------------------

      const warehouseSelect =
        document.getElementById("warehouseLocation");

      const warehouseValue =
        warehouseSelect?.value === "second"
          ? "second"
          : "main";

      const warehouseText =
        warehouseSelect?.selectedOptions?.[0]?.textContent.trim() ||
        (
          warehouseValue === "second"
            ? "Second Warehouse — Palina, Nagcarlan, Laguna"
            : "Main Warehouse — Brgy. II-C, San Pablo City, Laguna"
        );


      // ----------------------------------------------------------------------
      // REQUESTED PRODUCTS
      // ----------------------------------------------------------------------

      const products = Array.from(
        document.querySelectorAll(".product-item")
      ).map((card) => {

        const name =
          card.querySelector(".product-info h3")
            ?.textContent.trim() || "";

        const imagePath =
          card.querySelector(".product-image")
            ?.getAttribute("src") || "";

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


      // ----------------------------------------------------------------------
      // SELECTED SUPPLIERS
      // ----------------------------------------------------------------------

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
            card.querySelector(".supplier-card-body h3")
              ?.textContent.trim() || "",

          city:
            card.querySelector(".supplier-city")
              ?.textContent.trim() || "",

          rating: (metrics[0] || "").replace(/^★\s*/, ""),

          leadTime: metrics[1] || "",

          paymentTerms: metrics[2] || ""

        };

      });


      // ----------------------------------------------------------------------
      // JUSTIFICATION
      // ----------------------------------------------------------------------

      const justification =
        document.querySelector(".justification-box p")
          ?.textContent.trim() || "";


      // ----------------------------------------------------------------------
      // ATTACHMENTS
      // ----------------------------------------------------------------------

      const attachments = attachedFiles.map((file) => ({

        name: file.name,

        size: file.size,

        type: file.type

      }));


      // ----------------------------------------------------------------------
      // BUYER INFORMATION
      // ----------------------------------------------------------------------

      const buyerName =
        document.getElementById("loggedInName")
          ?.textContent.trim() || "Buyer";

      const buyerEmail =
        document.getElementById("loggedInEmail")
          ?.textContent.trim() || "buyer@gmail.com";


      // ----------------------------------------------------------------------
      // VALIDATION
      // ----------------------------------------------------------------------

      if (products.length === 0) {
        showToast("No requested products found.");
        return;
      }

      if (suppliers.length === 0) {
        showToast("Please select at least one supplier.");
        return;
      }


      // ----------------------------------------------------------------------
      // GENERATE RFQ NUMBER
      // ----------------------------------------------------------------------

      const prSuffix =
        prNumber.match(/(\d+)$/)?.[1] || "1";

      const rfqNumber =
        `RFQ-${prSuffix.padStart(4, "0")}`;


      // ----------------------------------------------------------------------
      // PREPARE CONFIRM RFQ DATA
      // ----------------------------------------------------------------------

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


      // ----------------------------------------------------------------------
      // SAVE DATA FOR CONFIRM RFQ PAGE
      // ----------------------------------------------------------------------

      try {

        sessionStorage.setItem(
          "uniprocur_rfq_preview",
          JSON.stringify(previewData)
        );

      } catch (error) {

        console.error(
          "Could not save RFQ preview:",
          error
        );

        showToast("Unable to save RFQ information.");

        return;

      }


      console.log("RFQ preview saved:", previewData);

      console.log(
        "Warehouse being passed:",
        warehouseValue
      );


      // ----------------------------------------------------------------------
      // UPDATE REVIEW MODAL SUMMARY
      // ----------------------------------------------------------------------

      const modalSuppliersCount =
        document.getElementById("modalSuppliersCount");

      const modalDeadline =
        document.getElementById("modalDeadline");

      const modalLocation =
        document.getElementById("modalLocation");

      const modalAttachmentCount =
        document.getElementById("modalAttachmentCount");


      if (modalSuppliersCount) {

        modalSuppliersCount.textContent =
          `${suppliers.length} supplier${suppliers.length !== 1 ? "s" : ""}`;

      }


      if (modalDeadline) {

        modalDeadline.textContent =
          `${submissionDate} at ${submissionTime} ${activeAmpm}`;

      }


      if (modalLocation) {

        modalLocation.textContent = warehouseText;

      }


      if (modalAttachmentCount) {

        modalAttachmentCount.textContent =
          attachments.length > 0
            ? `${attachments.length} file(s)`
            : "None";

      }


      // ----------------------------------------------------------------------
      // OPEN REVIEW MODAL
      // ----------------------------------------------------------------------

      if (
        reviewModal &&
        typeof reviewModal.showModal === "function"
      ) {

        reviewModal.showModal();

      } else {

        // Fallback if the review modal is unavailable.
        window.location.href = "confirm-rfq.html";

      }

    });

  }


  // ==========================================================================
  // REVIEW MODAL BUTTONS
  // ==========================================================================

  if (modalCloseBtn && reviewModal) {

    modalCloseBtn.addEventListener("click", (event) => {

      event.preventDefault();

      reviewModal.close();

    });

  }


  if (modalCancelBtn && reviewModal) {

    modalCancelBtn.addEventListener("click", (event) => {

      event.preventDefault();

      reviewModal.close();

    });

  }


  // Continue from Review Modal to Confirm RFQ.
  if (modalConfirmBtn) {

    modalConfirmBtn.addEventListener("click", (event) => {

      event.preventDefault();

      if (reviewModal && reviewModal.open) {
        reviewModal.close();
      }

      window.location.href = "confirm-rfq.html";

    });

  }


  // ==========================================================================
  // DELIVERY MAP — LEAFLET + OPENSTREETMAP
  // ==========================================================================

  console.log("RFQ map script is running.");

  const mapElement =
    document.getElementById("deliveryMap");

  const warehouseSelect =
    document.getElementById("warehouseLocation");

  const mapTag =
    document.querySelector(".map-tag");


  if (!mapElement || !warehouseSelect) {

    console.warn(
      "Map element or warehouse dropdown is missing."
    );

  } else if (typeof L === "undefined") {

    console.error("Leaflet did not load.");

  } else if (!mapElement._leaflet_id) {


    // Warehouse locations.
    const warehouses = {

      main: {

        name:
          "Main Warehouse — San Pablo City, Laguna",

        coordinates:
          [14.0657265, 121.3223515]

      },

      second: {

        name:
          "Second Warehouse — Nagcarlan, Laguna",

        coordinates:
          [14.1398816, 121.4206179]

      }

    };


    // Read the currently selected warehouse.
    const startingLocation =
      warehouses[warehouseSelect.value] || warehouses.main;


    // Create the map.
    const map = L.map(mapElement).setView(
      startingLocation.coordinates,
      15
    );


    // Load OpenStreetMap tiles.
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19
      }
    ).addTo(map);


    // Create warehouse marker.
    const marker = L.marker(
      startingLocation.coordinates
    ).addTo(map);

    marker.bindPopup(startingLocation.name);


    if (mapTag) {
      mapTag.textContent = startingLocation.name;
    }


    console.log(
      "Map initialized at:",
      startingLocation.name
    );


    // Change map when warehouse dropdown changes.
    warehouseSelect.addEventListener("change", function () {

      const selectedValue = warehouseSelect.value;

      console.log(
        "Warehouse dropdown changed to:",
        selectedValue
      );

      const selectedWarehouse =
        warehouses[selectedValue];

      if (!selectedWarehouse) {

        console.error(
          "Unknown warehouse value:",
          selectedValue
        );

        return;

      }


      // Move the map to the selected warehouse.
      map.flyTo(
        selectedWarehouse.coordinates,
        15,
        {
          animate: true,
          duration: 1.5,
          easeLinearity: 0.25
        }
      );


      // Move the marker.
      marker.setLatLng(
        selectedWarehouse.coordinates
      );

      marker.setPopupContent(
        selectedWarehouse.name
      );


      if (mapTag) {
        mapTag.textContent =
          selectedWarehouse.name;
      }


      console.log(
        "Map moved to:",
        selectedWarehouse.name,
        selectedWarehouse.coordinates
      );

    });


    // Fix map dimensions after page layout.
    window.setTimeout(() => {
      map.invalidateSize(true);
    }, 500);


    window.addEventListener("resize", () => {
      map.invalidateSize(true);
    });

  }


  // ==========================================================================
  // BACK TO EDIT RFQ
  // ==========================================================================

  const backToEditBtn =
    document.getElementById("backToEditBtn");

  if (backToEditBtn) {

    backToEditBtn.addEventListener("click", () => {

      window.location.href = "edit-rfq2.html";

    });

  }

});
