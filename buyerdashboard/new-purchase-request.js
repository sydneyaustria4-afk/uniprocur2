"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("purchaseRequestForm");
  const addItemButton = document.getElementById("addItemButton");
  const itemEntryList = document.getElementById("itemEntryList");
  const attachmentInput = document.getElementById("attachmentInput");
  const uploadButton = document.getElementById("uploadButton");
  const uploadPanel = document.getElementById("uploadPanel");
  const uploadedFileList = document.getElementById("uploadedFileList");
  const saveDraftButton = document.getElementById("saveDraftButton");
  const submitButton = document.getElementById("submitButton");
  const cancelButton = document.getElementById("cancelButton");
  const notificationButton = document.getElementById("notificationButton");
  const toast = document.getElementById("toast");

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = new Set([
    "doc", "docx", "xls", "xlsx", "pdf", "jpg", "jpeg", "png"
  ]);

  const WORKING_DRAFT_KEY = "uniprocur_new_pr_working";
  const SAVED_DRAFT_KEY = "uniprocur_new_pr_draft";
  const SELECTED_ITEM_KEY = "uniprocur_selected_pr_item";

  let toastTimer = null;
  let selectedFiles = [];
  let itemCounter = 0;

  function showToast(message) {
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3000);
  }

  function createItemField(labelText, control) {
    const wrapper = document.createElement("div");
    wrapper.className = "item-field";

    const label = document.createElement("label");
    label.textContent = labelText;
    label.htmlFor = control.id;

    wrapper.append(label, control);
    return wrapper;
  }

  function addItemRow(values = {}) {
    itemCounter += 1;

    const row = document.createElement("div");
    row.className = "item-entry";
    row.dataset.itemRow = String(itemCounter);
    row.dataset.itemCode = values.code || "";
    row.dataset.itemCategory = values.category || "";

    // Identify the selected catalog item without losing its code/category.
    if (values.code || values.category) {
      const identification = document.createElement("div");
      identification.className = "item-identification";

      const selectedName = document.createElement("strong");
      selectedName.textContent = values.name || "Selected item";

      const selectedMeta = document.createElement("span");
      selectedMeta.textContent = [values.code, values.category]
        .filter(Boolean)
        .join(" · ");

      identification.append(selectedName, selectedMeta);
      row.appendChild(identification);
    }

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = `itemName${itemCounter}`;
    nameInput.name = "itemName[]";
    nameInput.placeholder = "Enter item name";
    nameInput.autocomplete = "off";
    nameInput.value = values.name || "";

    const unitSelect = document.createElement("select");
    unitSelect.id = `itemUnit${itemCounter}`;
    unitSelect.name = "itemUnit[]";

    const units = [
      "Select unit", "square feet", "meters", "pairs", "gross",
      "pieces", "rolls", "liters", "pcs", "sq. ft.", "kg",
      "box", "pack", "roll", "pair", "piece"
    ];

    units.forEach((unit, index) => {
      const option = document.createElement("option");
      option.value = index === 0 ? "" : unit;
      option.textContent = unit;
      option.disabled = index === 0;
      option.selected = index === 0;
      unitSelect.append(option);
    });

    if (values.unit) unitSelect.value = values.unit;

    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.id = `itemQuantity${itemCounter}`;
    quantityInput.name = "itemQuantity[]";
    quantityInput.min = "0.01";
    quantityInput.step = "0.01";
    quantityInput.placeholder = "Quantity";
    quantityInput.value = values.quantity || "";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-item-button";
    removeButton.setAttribute("aria-label", "Remove item");
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => row.remove());

    row.append(
      createItemField("Item Name", nameInput),
      createItemField("Unit", unitSelect),
      createItemField("Quantity", quantityInput),
      removeButton
    );

    itemEntryList.append(row);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderSelectedFiles() {
    uploadedFileList.replaceChildren();

    selectedFiles.forEach((file, index) => {
      const row = document.createElement("li");
      row.className = "uploaded-file";

      const name = document.createElement("span");
      name.className = "uploaded-file-name";
      name.textContent = `${file.name} · ${formatFileSize(file.size)}`;
      name.title = file.name;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-file-button";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        selectedFiles.splice(index, 1);
        renderSelectedFiles();
      });

      row.append(name, remove);
      uploadedFileList.append(row);
    });
  }

  function addFiles(fileList) {
    const incomingFiles = Array.from(fileList || []);
    if (incomingFiles.length === 0) return;

    incomingFiles.forEach((file) => {
      const extension = file.name.split(".").pop().toLowerCase();

      if (!ALLOWED_EXTENSIONS.has(extension)) {
        showToast(`${file.name}: file type is not supported.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name}: file is larger than 20MB.`);
        return;
      }

      const duplicate = selectedFiles.some((existing) =>
        existing.name === file.name && existing.size === file.size
      );

      if (!duplicate) selectedFiles.push(file);
    });

    renderSelectedFiles();
    attachmentInput.value = "";
  }

  function collectFormData() {
    const items = Array.from(itemEntryList.querySelectorAll(".item-entry")).map((row) => ({
      code: row.dataset.itemCode || "",
      category: row.dataset.itemCategory || "",
      name: row.querySelector('[name="itemName[]"]').value.trim(),
      unit: row.querySelector('[name="itemUnit[]"]').value,
      quantity: row.querySelector('[name="itemQuantity[]"]').value
    }));

    return {
      requestNumber: document.getElementById("requestNumber").textContent.trim(),
      requiredDate: document.getElementById("requiredDate").value,
      justification: document.getElementById("justification").value.trim(),
      items,
      attachments: selectedFiles.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type
      }))
    };
  }

  function restoreDraft(draft) {
    if (!draft || typeof draft !== "object") return;

    if (draft.requiredDate) {
      document.getElementById("requiredDate").value = draft.requiredDate;
    }

    if (typeof draft.justification === "string") {
      document.getElementById("justification").value = draft.justification;
    }

    if (Array.isArray(draft.items)) {
      draft.items.forEach((item) => addItemRow(item));
    }

    if (Array.isArray(draft.attachments) && draft.attachments.length > 0) {
      showToast("Request details restored. Please re-select your attachments.");
    }
  }

  function validateForSubmission(data) {
    if (!data.requiredDate) {
      showToast("Please select a required date.");
      document.getElementById("requiredDate").focus();
      return false;
    }

    if (!data.justification) {
      showToast("Please enter a justification.");
      document.getElementById("justification").focus();
      return false;
    }

    if (data.items.length === 0) {
      showToast("Please add at least one item.");
      addItemButton.focus();
      return false;
    }

    const incompleteItem = data.items.find((item) =>
      !item.name || !item.unit || !item.quantity || Number(item.quantity) <= 0
    );

    if (incompleteItem) {
      showToast("Complete the item name, unit, and quantity.");
      return false;
    }

    return true;
  }

  // Open the catalog and preserve the current unsaved request in this tab.
  addItemButton.addEventListener("click", () => {
    try {
      sessionStorage.setItem(WORKING_DRAFT_KEY, JSON.stringify(collectFormData()));
      window.location.href = "item-catalog.html";
    } catch (error) {
      console.error("Unable to preserve request before opening catalog:", error);
      showToast("Unable to open item catalog. Please try again.");
    }
  });

  uploadButton.addEventListener("click", () => attachmentInput.click());
  attachmentInput.addEventListener("change", (event) => addFiles(event.target.files));

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadPanel.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadPanel.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadPanel.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadPanel.classList.remove("is-dragging");
    });
  });

  uploadPanel.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

  saveDraftButton.addEventListener("click", () => {
    const data = collectFormData();

    try {
      localStorage.setItem(SAVED_DRAFT_KEY, JSON.stringify(data));
      showToast("Draft saved in this browser. It has not been saved to MySQL.");
    } catch (error) {
      console.error("Unable to save draft:", error);
      showToast("Unable to save the draft in this browser.");
    }
  });

  
submitButton.addEventListener("click", async () => {
  const data = collectFormData();

  if (!validateForSubmission(data)) return;

  const originalButtonHtml = submitButton.innerHTML;

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    // Send the request data to PHP.
    const formData = new FormData();

    formData.append("request", JSON.stringify({
      requiredDate: data.requiredDate,
      justification: data.justification,
      items: data.items
    }));

    // Send actual attachment files.
    selectedFiles.forEach((file) => {
      formData.append("attachments[]", file, file.name);
    });

    const response = await fetch(
      "../database/create-purchase-request.php",
      {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    let result;

    try {
      result = await response.json();
    } catch (parseError) {
      throw new Error(
        "The server returned an unreadable response. Check the PHP endpoint and XAMPP error log."
      );
    }

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Purchase Request submission failed."
      );
    }

    // Only continue after MySQL confirms success.
    const submittedPreview = {
      ...data,
      requestNumber: result.request_number,
      status: result.status
    };

    sessionStorage.setItem(
      "uniprocur_submitted_request_preview",
      JSON.stringify(submittedPreview)
    );

    sessionStorage.removeItem(WORKING_DRAFT_KEY);
    sessionStorage.removeItem(SELECTED_ITEM_KEY);
    localStorage.removeItem(SAVED_DRAFT_KEY);

    // Open the success page with the generated PR number.
    const destination =
      `purchase-request-submitted.html?pr=${encodeURIComponent(result.request_number)}`;

    window.location.href = destination;

  } catch (error) {
    console.error("Purchase Request submission error:", error);

    showToast(
      error.message || "Unable to submit the Purchase Request."
    );

    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonHtml;
  }
});


  cancelButton.addEventListener("click", () => {
    const hasContent = itemEntryList.children.length > 0 ||
      selectedFiles.length > 0 ||
      document.getElementById("justification").value.trim() !== "Q4 production materials for sneaker line (Style #SN-2026).";

    if (hasContent && !window.confirm("Cancel this Purchase Request? Unsaved changes will be lost.")) {
      return;
    }

    sessionStorage.removeItem(WORKING_DRAFT_KEY);
    sessionStorage.removeItem(SELECTED_ITEM_KEY);
    localStorage.removeItem(SAVED_DRAFT_KEY);
    window.location.href = "buyer-dashboard.html";
  });

  notificationButton.addEventListener("click", () => {
    showToast("You have no new notifications.");
  });

  // Restore the unsaved form after returning from the item catalog.
  try {
    const workingDraft = sessionStorage.getItem(WORKING_DRAFT_KEY);
    const savedDraft = localStorage.getItem(SAVED_DRAFT_KEY);

    if (workingDraft) {
      restoreDraft(JSON.parse(workingDraft));
      sessionStorage.removeItem(WORKING_DRAFT_KEY);
    } else if (savedDraft) {
      restoreDraft(JSON.parse(savedDraft));
    }

    // Add the one item selected in the catalog, then consume the one-time value.
    const selectedItemRaw = sessionStorage.getItem(SELECTED_ITEM_KEY);

    if (selectedItemRaw) {
      const selectedItem = JSON.parse(selectedItemRaw);
      sessionStorage.removeItem(SELECTED_ITEM_KEY);
      addItemRow({ ...selectedItem, quantity: "" });
      showToast(`${selectedItem.name} added. Enter its quantity.`);
    }
  } catch (error) {
    console.warn("Request details could not be restored:", error);
    showToast("Some request details could not be restored. Please check your items.");
  }
});
