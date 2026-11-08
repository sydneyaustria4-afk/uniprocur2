"use strict";

// UniProcur: Figma-style Submit for Approval confirmation for Purchase Orders.
// Load AFTER create-purchase-order.js via defer.
(() => {
  const $ = id => document.getElementById(id);
  const submitButton = $("submitApproval");
  const saveButton = $("saveDraft");
  const status = $("status");
  if (!submitButton || !saveButton || !status) return;

  const params = new URLSearchParams(location.search);
  const rfqNumber = params.get("rfq_number") || "";
  const quoteId = Number(params.get("quote_id"));
  let submitting = false;
  let submitted = false;

  const overlay = document.createElement("div");
  overlay.id = "poApprovalOverlay";
  overlay.className = "po-approval-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="po-confirm-dialog" role="dialog" aria-modal="true"
      aria-labelledby="poConfirmTitle" aria-describedby="poConfirmDescription">
      <button class="po-confirm-close" type="button" id="poConfirmClose" aria-label="Close">×</button>
      <h2 id="poConfirmTitle">Submit for Approval</h2>
      <p id="poConfirmDescription" class="po-confirm-prompt">
        Are you sure you want to submit <strong id="poConfirmNumberTop">this PO</strong> for approval?
      </p>
      <div class="po-confirm-warning"><strong>Warning:</strong> You will not be able to edit or delete this PO once submitted.</div>
      <div class="po-confirm-summary">
        <div class="po-confirm-summary-top">
          <strong id="poConfirmNumber">Purchase Order</strong>
          <span class="po-confirm-priority">Medium</span>
        </div>
        <div class="po-confirm-summary-line"><strong>Delivery Date:</strong><span id="poConfirmDelivery">—</span></div>
        <div class="po-confirm-summary-line"><strong id="poConfirmItemCount">0 Items:</strong><span id="poConfirmItems">—</span></div>
      </div>
      <label class="po-confirm-checkbox-row">
        <input id="poConfirmCheckbox" type="checkbox" />
        <span>I confirm all details are correct and ready for approval.</span>
      </label>
      <p id="poConfirmError" class="po-confirm-error" role="alert" hidden></p>
      <div class="po-confirm-footer">
        <button id="poConfirmCancel" class="po-confirm-cancel" type="button">Cancel</button>
        <button id="poConfirmSend" class="po-confirm-send" type="button" disabled>Submit for Approval →</button>
      </div>
    </section>`;
  document.body.append(overlay);
  const inside = id => overlay.querySelector(`#${id}`);
  const checkbox = inside("poConfirmCheckbox");
  const sendButton = inside("poConfirmSend");
  let previousFocus = null;

  const text = id => ($(id)?.textContent || "").trim();
  const isActualNumber = value => /^PO-\d{4}-\d+$/.test(value);

  function isPageReady() {
    return !submitted && !submitting &&
      rfqNumber && Number.isInteger(quoteId) && quoteId > 0 &&
      text("rfqLabel") === rfqNumber &&
      $("itemRows")?.querySelectorAll("tr").length > 0 &&
      Boolean($("expectedDelivery")?.value) &&
      Boolean($("deliveryAddress")?.value) &&
      !status.classList.contains("error") &&
      !saveButton.textContent.trim().startsWith("Saving");
  }

  // The original PO page is loaded asynchronously. Unlock only after
  // its awarded RFQ, items and delivery fields have been validated.
  function updateButtonAvailability() {
    submitButton.disabled = !isPageReady();
    if (!submitButton.disabled) submitButton.title = "Review and submit this Purchase Order";
  }
  const observer = new MutationObserver(updateButtonAvailability);
  observer.observe(status, { childList: true, attributes: true, attributeFilter: ["class"] });
  observer.observe($("itemRows"), { childList: true });
  updateButtonAvailability();

  function displayDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || "—";
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
      year: "numeric", month: "long", day: "2-digit"
    });
  }

  function closeModal() {
    if (submitting) return;
    overlay.hidden = true;
    document.body.classList.remove("po-modal-open");
    previousFocus?.focus?.();
  }

  function openModal() {
    if (!isPageReady()) return;
    previousFocus = document.activeElement;
    const currentNumber = text("poNumber");
    const displayNumber = isActualNumber(currentNumber)
      ? currentNumber
      : "New PO (number assigned on submission)";

    inside("poConfirmNumberTop").textContent = displayNumber;
    inside("poConfirmNumber").textContent = displayNumber;
    inside("poConfirmDelivery").textContent = displayDate($("expectedDelivery").value);
    const names = [...$("itemRows").querySelectorAll("tr")]
      .map(row => row.cells[1]?.textContent.trim()).filter(Boolean);
    inside("poConfirmItemCount").textContent = `${names.length} Item${names.length === 1 ? "" : "s"}:`;
    inside("poConfirmItems").textContent = names.join(", ") || "—";
    inside("poConfirmError").hidden = true;
    inside("poConfirmError").textContent = "";
    checkbox.checked = false;
    sendButton.disabled = true;
    sendButton.textContent = "Submit for Approval →";
    overlay.hidden = false;
    document.body.classList.add("po-modal-open");
    checkbox.focus();
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Request failed.");
    return data;
  }

  submitButton.addEventListener("click", openModal);
  checkbox.addEventListener("change", () => { sendButton.disabled = !checkbox.checked; });
  inside("poConfirmCancel").addEventListener("click", closeModal);
  inside("poConfirmClose").addEventListener("click", closeModal);
  overlay.addEventListener("click", event => { if (event.target === overlay) closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.hidden) closeModal();
  });

  sendButton.addEventListener("click", async () => {
    if (!checkbox.checked || submitting || submitted || !isPageReady()) return;
    submitting = true;
    sendButton.disabled = true;
    sendButton.textContent = "Submitting...";
    inside("poConfirmCancel").disabled = true;
    inside("poConfirmClose").disabled = true;
    inside("poConfirmError").hidden = true;
    const notes = $("notes").value.trim();

    try {
      let poNumber = text("poNumber");
      // Direct submission: create the official draft and its po_items first.
      // If already a draft, use its existing PO number (no duplicate INSERT).
      if (!isActualNumber(poNumber)) {
        const saved = await postJson("../database/save-po-draft.php", {
          rfq_number: rfqNumber,
          quote_id: quoteId,
          notes
        });
        poNumber = saved.po_number;
        $("poNumber").textContent = poNumber;
        $("poDate").textContent = displayDate(saved.order_date);
        saveButton.disabled = true;
        saveButton.textContent = "Draft Saved ✓";
      }
      const outcome = await postJson("../database/submit-po-for-approval.php", {
        po_number: poNumber,
        notes
      });
      submitted = true;
      overlay.hidden = true;
      document.body.classList.remove("po-modal-open");
      submitButton.disabled = true;
      submitButton.textContent = "Submitted ✓";
      saveButton.disabled = true;
      $("notes").readOnly = true;
      status.classList.remove("error");
      status.textContent = `${outcome.po_number} submitted for Manager approval (pending_approval).`;
      const notice = document.querySelector(".implementation-note");
      if (notice) notice.textContent = "This PO is now pending approval and can no longer be edited as a draft.";
    } catch (error) {
      console.error("PO submission error:", error);
      const message = inside("poConfirmError");
      message.textContent = error.message;
      message.hidden = false;
      // Keep the confirmation retryable if the draft was saved
      // but the second submission request failed.
      status.classList.remove("error");
      status.textContent = `PO submission was not completed: ${error.message}`;
    } finally {
      submitting = false;
      inside("poConfirmCancel").disabled = false;
      inside("poConfirmClose").disabled = false;
      sendButton.textContent = "Submit for Approval →";
      sendButton.disabled = !checkbox.checked || submitted;
      updateButtonAvailability();
    }
  });
})();
