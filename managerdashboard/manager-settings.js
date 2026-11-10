"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const API = "../database/manager-settings.php";
  const tabNames = ["profile", "security", "notifications"];
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  const panels = [...document.querySelectorAll("[data-settings-panel]")];
  const switches = [...document.querySelectorAll("[data-pref]")];
  const state = { csrf: "", canSave: false, preferences: {}, busy: false };
  let toastTimeout;

  function showStatus(message, isError = false) {
    const node = $(isError ? "settingsError" : "settingsNotice");
    const other = $(isError ? "settingsNotice" : "settingsError");
    other.hidden = true;
    node.textContent = message;
    node.hidden = false;
  }
  function toast(message) {
    const node = $("settingsToast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => node.hidden = true, 3300);
  }
  function activateTab(name, focus = false) {
    for (const tab of tabs) {
      const selected = tab.dataset.settingsTab === name;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    for (const panel of panels) panel.hidden = panel.dataset.settingsPanel !== name;
    if (history.replaceState) history.replaceState(null, "", "#" + name);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.settingsTab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      activateTab(tabs[next].dataset.settingsTab, true);
    });
  });

  function setIdentity(manager = {}) {
    const name = String(manager.full_name || "Manager");
    const email = String(manager.email || "—");
    const initial = (name.trim().charAt(0) || "M").toUpperCase();
    const firstName = name.trim().split(/\s+/)[0] || "Manager";
    $("welcomeText").textContent = `Welcome ${firstName}!`;
    for (const id of ["sidebarManagerName", "topbarManagerName", "profileName"]) $(id).textContent = name;
    for (const id of ["sidebarManagerEmail", "topbarManagerEmail", "profileEmail"]) $(id).textContent = email;
    for (const id of ["sidebarAvatar", "topbarAvatar", "profileAvatar"]) $(id).textContent = initial;
    $("settingsFullName").value = name;
    $("settingsEmail").value = email === "—" ? "" : email;
  }
  function setSwitch(node, on) {
    node.classList.toggle("is-on", !!on);
    node.setAttribute("aria-checked", String(!!on));
    node.textContent = on ? "On" : "Off";
  }
  function allowSave(canSave) {
    state.canSave = !!canSave;
    $("saveProfile").disabled = !state.canSave;
    $("settingsContact").disabled = !state.canSave;
    switches.forEach(node => node.disabled = !state.canSave);
  }
  async function readJson(response) {
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`Unexpected server response (HTTP ${response.status}). Check XAMPP PHP logs.`); }
    if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  }
  async function save(payload) {
    const response = await fetch(API, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "X-CSRF-Token": state.csrf },
      body: JSON.stringify(payload)
    });
    return readJson(response);
  }
  async function load() {
    try {
      const response = await fetch(API, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const data = await readJson(response);
      setIdentity(data.manager || {});
      state.csrf = String(data.csrf_token || "");
      state.preferences = data.preferences || {};
      $("settingsContact").value = String(state.preferences.contact_number || "");
      for (const node of switches) setSwitch(node, !!Number(state.preferences[node.dataset.pref]));
      allowSave(data.schema_ready === true && !!state.csrf);
      if (!data.schema_ready) showStatus("Profile loaded. To enable Save Changes and notification preferences, run the included manager_settings SQL migration.");
      else if (data.local_demo) showStatus("Local Manager demo mode: contact and preferences save to Procurement MySQL. HR-managed credentials are unchanged. Email notifications are not sent yet.");
    } catch (error) {
      allowSave(false);
      showStatus(error.message || "Unable to load Manager Settings.", true);
    }
  }

  $("profileForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!state.canSave || state.busy) return;
    const phone = $("settingsContact").value.trim();
    if (phone && !/^[+()\d\s-]{5,32}$/.test(phone)) {
      showStatus("Please enter a valid contact number (5–32 characters; numbers, spaces, +, -, or parentheses).", true);
      return;
    }
    state.busy = true;
    $("saveProfile").disabled = true;
    try {
      const result = await save({ action: "contact", contact_number: phone });
      state.preferences.contact_number = String(result.contact_number || "");
      showStatus("Contact number saved to Procurement MySQL. HR-managed full name, email, role, and password were not changed.");
      toast("Contact number saved.");
    } catch (error) { showStatus(error.message, true); }
    finally { state.busy = false; $("saveProfile").disabled = !state.canSave; }
  });
  switches.forEach(node => node.addEventListener("click", async () => {
    if (!state.canSave || state.busy) return;
    const preference = node.dataset.pref;
    const previous = node.getAttribute("aria-checked") === "true";
    state.busy = true;
    node.disabled = true;
    try {
      await save({ action: "notification", preference, enabled: !previous });
      setSwitch(node, !previous);
      state.preferences[preference] = Number(!previous);
      toast("Preference saved to MySQL. Email delivery is not connected yet.");
    } catch (error) { showStatus(error.message, true); setSwitch(node, previous); }
    finally { state.busy = false; node.disabled = !state.canSave; }
  }));
  $("notificationButton").addEventListener("click", () => toast("Notification delivery is not connected yet."));
  $("signOutButton").addEventListener("click", () => toast("Sign-out is managed by HR. No session was ended."));
  const hash = location.hash.replace(/^#/, "").toLowerCase();
  activateTab(tabNames.includes(hash) ? hash : "profile");
  load();
});
