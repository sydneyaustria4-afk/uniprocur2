"use strict";
(() => {
  const $ = id => document.getElementById(id);
  let csrfToken = "";
  let canSave = false;
  let savedPhone = "";
  const api = "../database/buyer-settings.php";

  function notify(text, error = false) {
    const node = error ? $("errorMessage") : $("statusMessage");
    node.textContent = text;
    node.hidden = false;
    if (error) $("statusMessage").hidden = true;
    else $("errorMessage").hidden = true;
  }
  function fill(id, val) {
    const node = $(id);
    if (node) node.textContent = String(val ?? "—");
  }
  function showTab(tabName) {
    for (const name of ["profile", "security", "notifications"]) {
      const selected = name === tabName;
      const tab = $("tab" + name[0].toUpperCase() + name.slice(1));
      const panel = $("panel" + name[0].toUpperCase() + name.slice(1));
      tab.classList.toggle("selected", selected);
      tab.setAttribute("aria-selected", String(selected));
      panel.hidden = !selected;
    }
    location.hash = tabName;
  }
  function setProfile(user, preferences) {
    const name = user.full_name || "Buyer";
    const email = user.email || "—";
    const initial = (name.trim().charAt(0) || "B").toUpperCase();
    for (const id of ["sideName", "topName", "profileName"]) fill(id, name);
    for (const id of ["sideEmail", "topEmail", "profileEmail", "securityEmail"]) fill(id, email);
    for (const id of ["sideInitial", "topInitial", "profileInitial"]) fill(id, initial);
    $("fullName").value = name;
    $("email").value = email;
    $("company").value = user.department || "Procurement";
    $("role").value = user.role === "buyer" ? "Buyer" : (user.role || "—");
    fill("securityRole", $("role").value);
    savedPhone = preferences.contact_number || "";
    $("contact").value = savedPhone;
    $("notifyPr").checked = !!Number(preferences.notify_pr ?? 1);
    $("notifyRfq").checked = !!Number(preferences.notify_rfq ?? 1);
    $("notifyPo").checked = !!Number(preferences.notify_po ?? 1);
  }
  function enableEditing(enabled) {
    $("contact").readOnly = !enabled;
    $("editActions").hidden = !enabled;
    $("editButton").hidden = enabled;
    if (enabled) $("contact").focus();
  }
  async function request(payload) {
    const response = await fetch(api, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || `Could not save (HTTP ${response.status}).`);
    return data;
  }
  async function load() {
    try {
      const response = await fetch(api, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || `Unable to load account (HTTP ${response.status}).`);
      setProfile(data.user || {}, data.preferences || {});
      csrfToken = data.csrf_token || "";
      canSave = data.authenticated === true && data.schema_ready === true && !!csrfToken;
      $("editButton").disabled = !canSave;
      $("editButton").title = canSave ? "Edit Buyer contact number" : "Saving requires HR-provided login and the Buyer Settings SQL table";
      $("saveNotifications").disabled = !canSave;
      for (const id of ["notifyPr", "notifyRfq", "notifyPo"]) $(id).disabled = !canSave;
      if (!data.authenticated) {
        notify("Local demo mode: account information can be viewed, but saving is disabled until the HR login integration sets the Buyer session.");
      } else if (!data.schema_ready) {
        notify("Buyer account loaded. Run the included buyer_settings.sql migration to enable saving contact and notification preferences.");
      }
    } catch (error) {
      console.error("Buyer settings:", error);
      notify(error.message || "Unable to load Buyer settings.", true);
    }
  }

  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
  $("supportButton").addEventListener("click", () => notify("For employee account questions or credential changes, please contact your HR team."));
  $("editButton").addEventListener("click", () => { if (canSave) enableEditing(true); });
  $("cancelButton").addEventListener("click", () => { $("contact").value = savedPhone; enableEditing(false); });
  $("saveButton").addEventListener("click", async () => {
    const phone = $("contact").value.trim();
    if (phone && !/^[+()\d\s-]{5,32}$/.test(phone)) { notify("Enter a valid contact number (5–32 characters).", true); return; }
    $("saveButton").disabled = true;
    try {
      await request({ action: "profile", contact_number: phone });
      savedPhone = phone;
      enableEditing(false);
      notify("Contact number saved to Buyer settings. HR-managed fields were not changed.");
    } catch (error) { notify(error.message, true); }
    finally { $("saveButton").disabled = false; }
  });
  $("saveNotifications").addEventListener("click", async () => {
    $("saveNotifications").disabled = true;
    try {
      await request({ action: "notifications", notify_pr: $("notifyPr").checked, notify_rfq: $("notifyRfq").checked, notify_po: $("notifyPo").checked });
      notify("Notification preferences saved to MySQL. Actual notification delivery must be integrated separately.");
    } catch (error) { notify(error.message, true); }
    finally { $("saveNotifications").disabled = !canSave; }
  });
  const initial = location.hash.replace(/^#/, "").toLowerCase();
  showTab(["profile", "security", "notifications"].includes(initial) ? initial : "profile");
  load();
})();
