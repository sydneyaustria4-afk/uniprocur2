/* LOCAL XAMPP classroom-only invoice verification UI.
 * Enhances the existing Figma Record Invoice modal; not a substitute for real Finance integration.
 * The backend rechecks PO, real GR, invoice quantities and prices before marking a demo ready.
 */
"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.getElementById("invoiceRecordDialog");
  if (!dialog || document.getElementById("captureDemoVerify")) return;
  const actions = dialog.querySelector(".capture-actions");
  const select = dialog.querySelector("#capturePoSelect");
  const notice = dialog.querySelector(".capture-warning");
  const form = dialog.querySelector("#captureInvoiceForm");
  if (!actions || !select || !form) return;

  // Finance posting and budget deduction are unrelated to this local classroom test.
  if (notice) notice.textContent = "CLASSROOM / LOCAL XAMPP: Supplier invoice capture and 3-way matching are simulated here. A simulated Ready to Post result is NOT a verified real-world invoice or authorization to post to Finance.";
  const box = document.createElement("label");
  box.className = "capture-demo-ack";
  box.id = "captureDemoBox";
  box.hidden = true;
  const check = document.createElement("input");
  check.type = "checkbox";
  check.id = "captureDemoAck";
  const words = document.createElement("span");
  words.textContent = "I confirm this is a CLASSROOM SIMULATION only. This does not verify a genuine supplier invoice and must not be posted to actual Finance records.";
  box.append(check, words);
  form.insertBefore(box, actions);
  const button = document.createElement("button");
  button.type = "button";
  button.id = "captureDemoVerify";
  button.className = "capture-demo-verify";
  button.textContent = "Verify Classroom Simulation";
  button.disabled = true;
  actions.append(button);
  const feedback = document.createElement("p");
  feedback.id = "captureDemoMessage";
  feedback.className = "capture-demo-message";
  feedback.hidden = true;
  form.insertBefore(feedback, actions.nextSibling);

  let eligible = false, busy = false, lastPo = "", requestId = 0, demoSaved = false;
  const setMsg = (message, isError = false) => {
    feedback.hidden = !message;
    feedback.textContent = message || "";
    feedback.classList.toggle("is-error", isError);
  };
  const updateButton = () => { button.disabled = busy || !eligible || !check.checked; };
  check.addEventListener("change", updateButton);
  const hide = () => { eligible = false; box.hidden = true; check.checked = false; updateButton(); };

  async function refresh() {
    if (!dialog.open) return;
    const poNumber = select.value || "";
    if (!/^PO-[A-Za-z0-9-]{1,26}$/.test(poNumber)) { hide(); return; }
    const mine = ++requestId;
    try {
      const response = await fetch("../database/buyer-invoice-integration-local.php?po_number=" + encodeURIComponent(poNumber), {
        credentials: "same-origin", cache: "no-store", headers: {Accept: "application/json"}
      });
      const data = await response.json();
      if (mine !== requestId || poNumber !== select.value || !dialog.open) return;
      if (!response.ok || !data.success) { hide(); return; }
      const inv = data.invoice;
      if (lastPo !== poNumber) {
        lastPo = poNumber; check.checked = false; setMsg("");
      }
      const isDemo = inv?.source_kind === "demo";
      const verified = isDemo && inv.match_status === "demo_ready" && inv.status === "ready_to_post" && data.match?.data_matched === true;
      eligible = Boolean(isDemo && data.match?.data_matched === true && ["pending_match", "discrepancy"].includes(String(inv?.status || "").toLowerCase()));
      box.hidden = !isDemo || verified;
      button.hidden = !isDemo;
      button.textContent = verified ? "Classroom Simulation Verified ✓" : "Verify Classroom Simulation";
      if (verified) setMsg("Classroom DEMO Ready to Post saved. Genuine supplier document is NOT verified; Finance posting remains disabled.");
      else if (isDemo && !data.match?.data_matched) setMsg("Cannot verify: PO, actual Goods Receipt and invoice must all match.", true);
      updateButton();
    } catch (error) {
      if (mine === requestId) {hide(); setMsg("Could not check the local 3-way match: " + (error.message || "connection error"), true);}
    }
  }

  button.addEventListener("click", async () => {
    if (!eligible || !check.checked || busy) return;
    const poNumber = select.value || "";
    busy = true; updateButton();setMsg("Checking real GR quantities and storing classroom verification...");
    try {
      const getResponse = await fetch("../database/buyer-invoice-integration-local.php?po_number=" + encodeURIComponent(poNumber), {
        credentials: "same-origin", cache: "no-store", headers: {Accept: "application/json"}
      });
      const d = await getResponse.json();
      if (!getResponse.ok || !d.success || !d.csrf_token || !d.invoice || d.invoice.source_kind !== "demo") {
        throw new Error(d.message || "Could not load current invoice verification session.");
      }
      const response = await fetch("../database/buyer-invoice-integration-local.php", {
        method: "POST", credentials: "same-origin",
        headers: {"Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": d.csrf_token},
        body: JSON.stringify({action: "verify_demo", po_number: poNumber, demo_acknowledged: true})
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Demo verification failed.");
      setMsg(result.message || "Classroom demo verification recorded.");
      demoSaved = true;
      check.checked = false;
      eligible = false;
      // The original dashboard list loads on page reload and then shows the new stored status.
      await refresh();
    } catch (error) { setMsg(error.message || "Failed to verify classroom simulation.", true); }
    finally {busy = false; updateButton();}
  });
  // The original modal's data loader sets this message after each save, verify or PO switch.
  const existingMessage = dialog.querySelector("#captureMessage");
  if (existingMessage) {
    const observer = new MutationObserver(() => { if (dialog.open) refresh(); });
    observer.observe(existingMessage, {childList: true, characterData: true, subtree: true});
  }
  const openObserver = new MutationObserver(() => {
    if (dialog.open) refresh();
    else {requestId++; hide(); lastPo = ""; setMsg("");}
  });
  openObserver.observe(dialog, {attributes: true, attributeFilter: ["open"]});
  select.addEventListener("change", () => {setMsg(""); check.checked = false; refresh();});
  dialog.addEventListener("close", () => { if (demoSaved) window.location.reload(); });
  if (dialog.open) refresh();
});
