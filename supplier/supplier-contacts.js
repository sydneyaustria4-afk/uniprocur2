"use strict";
/* This file enhances ONLY Buyer Supplier Call and Email buttons.
 * No changes to managerdashboard or the supplier catalog are required. */
(() => {
  const profilesApi = "../database/get-buyer-supplier-profile.php";
  const dialog = document.createElement("dialog");
  dialog.className = "upc-dialog";
  dialog.setAttribute("aria-labelledby", "upc-title");
  // Only constant template markup. All server/user fields are set via textContent.
  dialog.innerHTML = `
    <div class="upc-header"><div><h2 id="upc-title">Supplier Contact</h2>
      <p id="upc-subtitle">Loading...</p></div>
      <button type="button" class="upc-x" id="upc-x" aria-label="Close">×</button></div>
    <div class="upc-body">
      <div class="upc-field"><span>Contact Person</span><strong id="upc-person">—</strong></div>
      <div class="upc-field"><span id="upc-method-label">Phone</span><strong id="upc-method">—</strong></div>
      <p id="upc-source" class="upc-source"></p>
      <p id="upc-error" class="upc-error" role="alert" hidden></p>
    </div>
    <div class="upc-footer">
      <button type="button" id="upc-copy" class="upc-secondary">Copy</button>
      <a id="upc-open" class="upc-primary" href="#" hidden>Open</a>
      <button type="button" id="upc-close" class="upc-secondary">Close</button>
    </div>`;
  document.body.append(dialog);

  const get = id => dialog.querySelector(`#${id}`);
  const close = () => dialog.close();
  get("upc-x").addEventListener("click", close);
  get("upc-close").addEventListener("click", close);
  dialog.addEventListener("click", ev => { if (ev.target === dialog) close(); });

  let copyValue = "";
  let selectedMode = "phone";
  let selectedName = "";
  const validPhone = v => /^[+0-9()\- .]{6,30}$/.test(v);
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const getKey = name => ["marikina", "cordillera", "synthhide", "soletech", "metalcraft", "ecobox"]
    .find(key => String(name || "").toLowerCase().includes(key));

  function message(text) {
    const el = get("upc-error");
    el.textContent = text;
    el.hidden = !text;
  }

  get("upc-copy").addEventListener("click", async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      get("upc-copy").textContent = "Copied!";
      window.setTimeout(() => get("upc-copy").textContent = "Copy", 1600);
    } catch (_) {
      window.prompt("Copy contact details:", copyValue);
    }
  });

  async function showContact(card, mode) {
    const name = card.querySelector(".supplier-info h2")?.textContent?.trim() || "Supplier";
    selectedMode = mode;
    selectedName = name;
    copyValue = "";
    get("upc-title").textContent = mode === "phone" ? "Call Supplier" : "Email Supplier";
    get("upc-subtitle").textContent = name;
    get("upc-person").textContent = "Loading...";
    get("upc-method-label").textContent = mode === "phone" ? "Phone" : "Email";
    get("upc-method").textContent = "Loading...";
    get("upc-source").textContent = "";
    get("upc-copy").disabled = true;
    get("upc-copy").textContent = "Copy";
    get("upc-open").hidden = true;
    message("");
    if (!dialog.open) dialog.showModal();

    try {
      const response = await fetch(profilesApi, {
        credentials: "same-origin", cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.message || "Supplier details unavailable.");
      }
      // Ignore an obsolete response if a different card is selected.
      if (selectedName !== name || selectedMode !== mode || !dialog.open) return;
      const profile = body.suppliers?.[getKey(name)];
      if (!profile) throw new Error("Supplier profile not found.");
      const value = String(profile[mode] ?? "").trim();
      get("upc-person").textContent = profile.contact || "Not provided";
      get("upc-method").textContent = value || "Not provided";
      const fromSample = profile.source?.[mode] === "manager_sample";
      get("upc-source").textContent = fromSample
        ? "Sample contact from the existing Manager PO profile. Verify before contacting."
        : "Contact from the suppliers database.";
      const isValid = mode === "phone" ? validPhone(value) : validEmail(value);
      copyValue = isValid ? value : "";
      get("upc-copy").disabled = !isValid;
      const open = get("upc-open");
      open.hidden = !isValid;
      if (isValid) {
        open.href = mode === "phone"
          ? "tel:" + value.replace(/[^0-9+]/g, "")
          : "mailto:" + encodeURIComponent(value) + "?subject=" + encodeURIComponent("UniProcur - Supplier Inquiry");
        open.textContent = mode === "phone" ? "Open dialer" : "Compose email";
      } else {
        message(`No valid ${mode === "phone" ? "phone number" : "email address"} is available.`);
      }
    } catch (error) {
      get("upc-person").textContent = "—";
      get("upc-method").textContent = "Unavailable";
      message(error.message || "Unable to load supplier details.");
    }
  }

  // Keep the names printed on Buyer supplier cards in sync with the same
  // supplier contact data used by the Manager PO and both contact dialogs.
  // This is display-only; it does not update any database record.
  async function refreshSupplierCardContacts() {
    try {
      const response = await fetch(profilesApi, {
        credentials: "same-origin", cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      const data = await response.json();
      if (!response.ok || !data.success) return;
      document.querySelectorAll(".supplier-card").forEach(card => {
        const supplierName = card.querySelector(".supplier-info h2")?.textContent?.trim();
        const profile = data.suppliers?.[getKey(supplierName)];
        const personLabel = card.querySelector(".supplier-tags span");
        if (personLabel && profile?.contact) {
          personLabel.textContent = String(profile.contact);
        }
      });
    } catch (error) {
      // Original HTML labels remain visible if the API is temporarily offline.
      console.warn("Supplier card contacts unavailable:", error);
    }
  }
  refreshSupplierCardContacts();

  // CAPTURE means the existing supplier.js [data-toast] button handler
  // never fires for phone/email; all other existing actions are unaffected.
  document.addEventListener("click", event => {
    const btn = event.target.closest(".supplier-actions .phone-action, .supplier-actions .mail-action");
    if (!btn) return;
    const card = btn.closest(".supplier-card");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showContact(card, btn.classList.contains("phone-action") ? "phone" : "email");
  }, true);
})();
