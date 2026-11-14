
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
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

  // UNIPROCUR_REQUIRED_DATE_CLIENT_GUARD_20261113
  const requiredDateInput = document.getElementById("requiredDate");

  function manilaTodayISO() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function refreshRequiredDateLimit() {
    const today = manilaTodayISO();
    requiredDateInput.min = today;
    return today;
  }

  if (requiredDateInput) {
    refreshRequiredDateLimit();
    requiredDateInput.addEventListener("focus", refreshRequiredDateLimit);
    requiredDateInput.addEventListener("change", () => {
      const minimum = refreshRequiredDateLimit();
      if (requiredDateInput.value && requiredDateInput.value < minimum) {
        requiredDateInput.value = "";
        showToast("Required Date cannot be in the past. Choose today or a future date.");
      }
    });
  }
  const toast = document.getElementById("toast");

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = new Set([
    "doc", "docx", "xls", "xlsx", "pdf", "jpg", "jpeg", "png"
  ]);

  const WORKING_DRAFT_KEY = "uniprocur_new_pr_working";
  const SAVED_DRAFT_KEY = "uniprocur_new_pr_draft";
  const SELECTED_ITEM_KEY = "uniprocur_selected_pr_item";
  const SAVED_DRAFT_RECORD_KEY = "uniprocur_saved_pr_record_id";
  const editPrNumber = new URLSearchParams(
  window.location.search
).get("pr");

  let toastTimer = null;
  let selectedFiles = [];
  let itemCounter = 0;

let savedRequestId = editPrNumber
  ? null
  : (Number(localStorage.getItem(SAVED_DRAFT_RECORD_KEY)) || null);

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
    const items = Array.from(
      itemEntryList.querySelectorAll(".item-entry")
    ).map((row) => ({
      code: row.dataset.itemCode || "",
      category: row.dataset.itemCategory || "",
      name: row.querySelector('[name="itemName[]"]').value.trim(),
      unit: row.querySelector('[name="itemUnit[]"]').value,
      quantity: row.querySelector('[name="itemQuantity[]"]').value
    }));

    return {
      requestId: savedRequestId,
      requestNumber:
        document.getElementById("requestNumber").textContent.trim(),
      requiredDate:
        document.getElementById("requiredDate").value,
      justification:
        document.getElementById("justification").value.trim(),
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

    if (draft.requestId) {
      savedRequestId =
        Number(draft.requestId) || savedRequestId;

        const browserDraftId =
  Number(localStorage.getItem(SAVED_DRAFT_RECORD_KEY)) || 0;

const updateBrowserDraft =
  !editPrNumber || browserDraftId === savedRequestId;
    }



    if (draft.requestNumber) {
      document.getElementById("requestNumber").textContent =
        draft.requestNumber;
    }

    if (draft.requiredDate) {
      document.getElementById("requiredDate").value =
        draft.requiredDate;
    }

    if (typeof draft.justification === "string") {
      document.getElementById("justification").value =
        draft.justification;
    }

    if (Array.isArray(draft.items)) {
      draft.items.forEach((item) => addItemRow(item));
    }

    if (
      Array.isArray(draft.attachments) &&
      draft.attachments.length > 0
    ) {
      showToast(
        "Request details restored. Please re-select your attachments."
      );
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

  async function savePurchaseRequest(action) {
    const data = collectFormData();

    if (!data.requiredDate) {
      showToast("Please select a required date.");
      document.getElementById("requiredDate").focus();
      return;
    }

    // Recheck against Manila date on both Save Draft and Submit, even after midnight.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.requiredDate) ||
        data.requiredDate < refreshRequiredDateLimit()) {
      showToast("Required Date cannot be in the past. Choose today or a future date.");
      requiredDateInput.focus();
      return;
    }

    if (
      action === "submitted" &&
      !validateForSubmission(data)
    ) {
      return;
    }

    // UNIPROCUR_SAVE_DRAFT_QTY_VALIDATION_V1
    // MySQL pr_items.qty is DECIMAL(10,2) CHECK(qty > 0).
    // A draft may have no items, but any listed item needs a valid quantity.
    const invalidQuantityIndex = data.items.findIndex((item) => {
      const raw = String(item.quantity ?? "").trim();
      return !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw) ||
        Number(raw) < 0.01 || Number(raw) > 99999999.99;
    });
    if (invalidQuantityIndex !== -1) {
      showToast(`Item ${invalidQuantityIndex + 1}: enter a quantity above zero (up to 2 decimals), or remove the unfinished item.`);
      const itemRows = itemEntryList.querySelectorAll(".item-entry");
      itemRows[invalidQuantityIndex]?.querySelector('[name="itemQuantity[]"]')?.focus();
      return;
    }

    const button =
      action === "draft" ? saveDraftButton : submitButton;

    const originalHtml = button.innerHTML;

    button.disabled = true;
    button.textContent =
      action === "draft" ? "Saving Draft..." : "Submitting...";

    try {
      const formData = new FormData();

      formData.append(
        "request",
        JSON.stringify({
          action,
          requestId: savedRequestId,
          requiredDate: data.requiredDate,
          justification: data.justification,
          items: data.items
        })
      );

      // Upload actual selected files.
      selectedFiles.forEach((file) => {
        formData.append("attachments[]", file, file.name);
      });

      const response = await fetch(
        "../database/save-purchase-request.php",
        {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          headers: {
            "Accept": "application/json"
          }
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Purchase Request could not be saved."
        );
      }

      // Remember the database record ID.
      savedRequestId =
        Number(result.request_id) || savedRequestId;

      if (savedRequestId) {
        localStorage.setItem(
          SAVED_DRAFT_RECORD_KEY,
          String(savedRequestId)
        );
      }

      const requestNumber =
        result.request_number || data.requestNumber;

      document.getElementById("requestNumber").textContent =
        requestNumber;

      // SAVE DRAFT
      if (action === "draft") {
        localStorage.setItem(
          SAVED_DRAFT_KEY,
          JSON.stringify({
            ...data,
            requestId: savedRequestId,
            requestNumber
          })
        );

        window.location.href =
  `view-purchase-request.html?pr=${encodeURIComponent(requestNumber)}`;

return;(
          `Draft ${requestNumber} saved to MySQL.`
        );

        return;
      }

      // SUBMIT FOR APPROVAL
      sessionStorage.removeItem(WORKING_DRAFT_KEY);
      sessionStorage.removeItem(SELECTED_ITEM_KEY);

      localStorage.removeItem(SAVED_DRAFT_KEY);
      localStorage.removeItem(SAVED_DRAFT_RECORD_KEY);

      sessionStorage.setItem(
        "uniprocur_submitted_request_preview",
        JSON.stringify({
          ...data,
          requestId: result.request_id,
          requestNumber,
          status: result.status
        })
      );

      // Open the existing success page.
      window.location.href =
        `purchase-request-submitted.html?pr=${encodeURIComponent(requestNumber)}`;

    } catch (error) {
      console.error("Purchase Request save error:", error);

      showToast(
        error.message || "Unable to save the Purchase Request."
      );

    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  // Open the catalog and preserve the current unsaved request in this tab.
  addItemButton.addEventListener("click", () => {
    try {
      sessionStorage.setItem(
        WORKING_DRAFT_KEY,
        JSON.stringify(collectFormData())
      );

      window.location.href = "item-catalog.html";
    } catch (error) {
      console.error("Unable to preserve request before opening catalog:", error);
      showToast("Unable to open item catalog. Please try again.");
    }
  });

  uploadButton.addEventListener("click", () => attachmentInput.click());

  attachmentInput.addEventListener("change", (event) => {
    addFiles(event.target.files);
  });

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

  uploadPanel.addEventListener("drop", (event) => {
    addFiles(event.dataTransfer.files);
  });

  // SAVE DRAFT TO MYSQL
  saveDraftButton.addEventListener("click", () => {
    savePurchaseRequest("draft");
  });

  // SUBMIT PURCHASE REQUEST TO MYSQL
  submitButton.addEventListener("click", () => {
    savePurchaseRequest("submitted");
  });

  // CANCEL PURCHASE REQUEST
  cancelButton.addEventListener("click", () => {

if (editPrNumber) {
  // Discard unsaved changes from the editing session.
  sessionStorage.removeItem(WORKING_DRAFT_KEY);
  sessionStorage.removeItem(SELECTED_ITEM_KEY);

  // Return to the original Purchase Request.
  window.location.href =
    `view-purchase-request.html?pr=${encodeURIComponent(editPrNumber)}`;

  return;
}

    const hasContent =
      itemEntryList.children.length > 0 ||
      selectedFiles.length > 0 ||
      document.getElementById("justification").value.trim() !==
        "Q4 production materials for sneaker line (Style #SN-2026).";

    if (
      hasContent &&
      !window.confirm(
        "Leave this Purchase Request? Saved drafts will remain available."
      )
    ) {
      return;
    }

    sessionStorage.removeItem(WORKING_DRAFT_KEY);
    sessionStorage.removeItem(SELECTED_ITEM_KEY);

    // Clear the local link to the draft so a new request
    // will not accidentally update the previous database record.
    localStorage.removeItem(SAVED_DRAFT_KEY);
    localStorage.removeItem(SAVED_DRAFT_RECORD_KEY);

    window.location.href = "buyer-dashboard.html";
  });

  notificationButton.addEventListener("click", () => {
    showToast("You have no new notifications.");
  });

 
  // Restore PR data from MySQL when editing.
  if (editPrNumber) {
    saveDraftButton.disabled = true;
    submitButton.disabled = true;
    addItemButton.disabled = true;
  }

  try {
    const workingRaw = sessionStorage.getItem(WORKING_DRAFT_KEY);
    const savedRaw = localStorage.getItem(SAVED_DRAFT_KEY);

    let acceptCatalogItem = !editPrNumber;

    if (editPrNumber) {
      const response = await fetch(
        "../database/get-purchase-request.php?pr_number=" +
          encodeURIComponent(editPrNumber),
        {
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Accept": "application/json" }
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to load Purchase Request."
        );
      }

      const pr = result.purchase_request;

      if (
        pr.pr_number !== editPrNumber ||
        String(pr.status).toLowerCase() !== "draft"
      ) {
        throw new Error("Only existing draft PRs can be edited.");
      }

      savedRequestId = Number(pr.id);

      if (!Number.isSafeInteger(savedRequestId) ||
          savedRequestId <= 0) {
        throw new Error("Invalid Purchase Request ID.");
      }

      // Preserve unsaved changes after visiting Item Catalog.
      const working = workingRaw ? JSON.parse(workingRaw) : null;

      const sameDraft = working &&
        working.requestNumber === pr.pr_number &&
        Number(working.requestId) === savedRequestId;

      acceptCatalogItem = Boolean(sameDraft);

      const draft = sameDraft ? working : {
        requestId: savedRequestId,
        requestNumber: pr.pr_number,
        requiredDate: pr.needed_by,
        justification: pr.purpose || "",
        items: (result.items || []).map(item => ({
          code: item.item_code || "",
          category: item.category || "",
          name: item.item_name || "",
          unit: item.unit || "",
          quantity: item.qty || ""
        }))
      };

      itemEntryList.replaceChildren();
      restoreDraft(draft);

      document.title = "UniProcur | Edit Purchase Request";

      const title = document.querySelector(
        ".request-brand .brand-copy > span"
      );
      if (title) title.textContent = "Edit Purchase Request";

      document.querySelector(".request-outer-card")
        ?.setAttribute("aria-label", "Edit Purchase Request form");

      sessionStorage.removeItem(WORKING_DRAFT_KEY);

      saveDraftButton.disabled = false;
      submitButton.disabled = false;
      addItemButton.disabled = false;

    } else if (workingRaw) {
      restoreDraft(JSON.parse(workingRaw));
      sessionStorage.removeItem(WORKING_DRAFT_KEY);

    } else if (savedRaw) {
      restoreDraft(JSON.parse(savedRaw));
    }

    // Restore item selected from Item Catalog.
    const selectedRaw = sessionStorage.getItem(SELECTED_ITEM_KEY);

    if (selectedRaw) {
      sessionStorage.removeItem(SELECTED_ITEM_KEY);

      if (acceptCatalogItem) {
        const selected = JSON.parse(selectedRaw);
        addItemRow({ ...selected, quantity: "" });
        showToast(`${selected.name} added. Enter its quantity.`);
      }
    }

  } catch (error) {
    console.error("Purchase Request loading error:", error);
    showToast(error.message || "Unable to load PR.");

    if (editPrNumber) {
      saveDraftButton.disabled = true;
      submitButton.disabled = true;
      addItemButton.disabled = true;
      window.alert(
        "Unable to load this draft. No new PR was created.\n" +
        error.message
      );
    }
  }

});
