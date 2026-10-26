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

    if (modalConfirmBtn) {
      modalConfirmBtn.addEventListener("click", () => {
        reviewModal.close();
        showToast("RFQ invitation drafted successfully! Preparing confirmation...");
      });
    }
  



  // Review & Submit RFQ: Navigate directly to edit-rfq.html
  if (reviewSubmitBtn) {
    reviewSubmitBtn.addEventListener("click", () => {
      window.location.href = "edit-rfq.html";
    });
  }






/* ======================MAP===================================================
   Delivery Map — Leaflet + OpenStreetMap
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const mapElement = document.getElementById("deliveryMap");
  const warehouseSelect = document.getElementById("warehouseLocation");
  const mapTag = document.querySelector(".map-tag");

  // Check whether the map element exists.
  if (!mapElement) {
    console.error("Delivery map element was not found.");
    return;
  }

  // Check whether Leaflet loaded successfully.
  if (typeof window.L === "undefined") {
    console.error("Leaflet did not load. Check your internet connection.");
    return;
  }

  // Prevent the same map from being initialized twice.
  if (mapElement._leaflet_id) {
    console.warn("The delivery map is already initialized.");
    return;
  }

  // Warehouse locations.
  const warehouseLocations = {
    main: {
      coordinates: [14.0657265, 121.3223515],
      label: "Main Warehouse — Brgy. II-C, San Pablo City, Laguna"
    },

    second: {
      coordinates: [14.1398816, 121.4206179],
      label: "Second Warehouse — Palina, Nagcarlan, Laguna"
    }
  };

  // Use the selected warehouse, or the main warehouse by default.
  const initialLocation =
    warehouseLocations[warehouseSelect?.value] ||
    warehouseLocations.main;

  // Initialize the map.
  const map = window.L.map(mapElement).setView(
    initialLocation.coordinates,
    15
  );

  // Load OpenStreetMap tiles.
  window.L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);

  // Add the warehouse marker.
  const marker = window.L.marker(initialLocation.coordinates)
    .addTo(map)
    .bindPopup(initialLocation.label);

  // Show the selected warehouse name.
  if (mapTag) {
    mapTag.textContent = initialLocation.label;
  }

  // Update the map when the dropdown changes.
  if (warehouseSelect) {
    warehouseSelect.addEventListener("change", () => {
      const selectedLocation =
        warehouseLocations[warehouseSelect.value];

      if (!selectedLocation) return;

      map.flyTo(selectedLocation.coordinates, 15);

      marker.setLatLng(selectedLocation.coordinates);
      marker.setPopupContent(selectedLocation.label);

      if (mapTag) {
        mapTag.textContent = selectedLocation.label;
      }
    });
  }

  // Refresh map sizing after the page layout is rendered.
  requestAnimationFrame(() => {
    map.invalidateSize();
  });

  window.addEventListener("resize", () => {
    map.invalidateSize();
  });

  console.log("Delivery map initialized successfully.");
});
