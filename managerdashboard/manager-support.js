"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const API = "../database/manager-support-api.php";
  const DOWNLOAD = "../database/manager-support-download.php";
  const MAX_FILE = 20 * 1024 * 1024;
  const MAX_TOTAL = 25 * 1024 * 1024;
  const ALLOWED = new Set(["doc", "docx", "xls", "xlsx", "pdf", "jpg", "jpeg", "png"]);
  const state = {tickets: [], csrfToken: "", showAll: false, files: [], busy: false};
  const searchInput = $("supportSearchInput");
  const faqItems = [...document.querySelectorAll(".support-faq-item")];
  const ticketSection = $("supportTicketDetail");
  const formatDate = value => {
    if (!value) return "—";
    const d = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-PH", {month:"short",day:"numeric",year:"numeric"});
  };
  const formatSize = size => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`;
  let toastTimer;
  function toast(message) {
    const target = $("supportManagerToast");
    target.textContent = message;
    target.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => target.hidden = true, 3200);
  }
  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(text);
    return node;
  }
  function filterFaqs() {
    const query = searchInput.value.trim().toLowerCase();
    let count = 0;
    for (const item of faqItems) {
      item.hidden = !item.textContent.toLowerCase().includes(query);
      if (!item.hidden) count++;
    }
    $("supportFaqEmpty").hidden = count !== 0;
  }
  $("supportSearch").addEventListener("submit", event => {event.preventDefault();filterFaqs();});
  searchInput.addEventListener("input", filterFaqs);
  function identity(manager) {
    const name = String(manager?.full_name || "Manager");
    const email = String(manager?.email || "—");
    const first = name.trim().split(/\s+/)[0] || "Manager";
    const initial = name.trim().charAt(0).toUpperCase() || "M";
    
$("welcomeText").textContent = "Welcome Manager!";

    for (const id of ["sidebarManagerName", "topbarManagerName"]) $(id).textContent = name;
    for (const id of ["sidebarManagerEmail", "topbarManagerEmail"]) $(id).textContent = email;
    for (const id of ["sidebarAvatar", "topbarAvatar"]) $(id).textContent = initial;
  }
  function renderTickets() {
    const tbody = $("supportTicketsBody");
    tbody.replaceChildren();
    const visible = state.showAll ? state.tickets : state.tickets.slice(0, 5);
    if (!visible.length) {
      const row = element("tr"), col = element("td", "support-table-empty", "No support requests saved yet. Submit your first request below.");
      col.colSpan = 6; row.append(col);tbody.append(row);
    }
    for (const ticket of visible) {
      const tr = element("tr");
      tr.dataset.ticketId = String(ticket.id);
      tr.append(element("td", "", ticket.ticket_number));
      const subject = String(ticket.subject || "").replace(/\s+/g, " ");
      tr.append(element("td", "", subject.length > 75 ? subject.slice(0, 73) + "…" : subject));
      tr.append(element("td", "", ticket.category));
      tr.append(element("td", "", formatDate(ticket.created_at)));
      const statusTd = element("td");
      statusTd.append(element("span", `support-status support-status-${String(ticket.status || "open").replace(/[^a-z_]/g, "")}`, ticket.status_display || "Open"));
      tr.append(statusTd);
      const action = element("td"), button = element("button", "support-ticket-view", "View");
      button.type = "button";button.dataset.ticketId = String(ticket.id);button.setAttribute("aria-label",`View ${ticket.ticket_number}`);
      action.append(button); tr.append(action);
      tbody.append(tr);
    }
    const toggle = $("toggleAllTickets");
    toggle.hidden = state.tickets.length <= 5;
    toggle.textContent = state.showAll ? "Show recent requests ↑" : `View all ${state.tickets.length} support requests →`;
  }
  async function loadTickets() {
    const response = await fetch(API, {credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || `Support API failed (HTTP ${response.status}).`);
    state.csrfToken = String(data.csrf_token || "");
    state.tickets = Array.isArray(data.tickets) ? data.tickets : [];
    identity(data.manager || {});
    renderTickets();
  }
  $("toggleAllTickets").addEventListener("click", () => {state.showAll=!state.showAll;renderTickets();});
  function openDetail(ticket) {
    $("supportDetailMeta").textContent = `${ticket.ticket_number} · Submitted ${formatDate(ticket.created_at)}`;
    $("supportDetailTitle").textContent = `${ticket.ticket_number} — ${ticket.status_display || "Open"}`;
    $("detailCategory").textContent = ticket.category || "—";
    $("detailReference").textContent = ticket.reference_number || "Not specified";
    $("detailStatus").textContent = ticket.status_display || "Open";
    $("detailDescription").textContent = ticket.subject || "—";
    const list = $("detailAttachments"); list.replaceChildren();
    const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
    if (!attachments.length) list.append(element("p", "", "No attachments."));
    for (const item of attachments) {
      const link = element("a", "", `${item.original_name} (${formatSize(Number(item.file_size) || 0)}) ↓`);
      link.href = `${DOWNLOAD}?file_id=${encodeURIComponent(item.id)}`;
      list.append(link);
    }
    ticketSection.hidden = false;
    document.querySelector(".support-page").classList.add("is-detail");
    ticketSection.scrollIntoView({behavior:"smooth",block:"start"});
  }
  $("supportTicketsBody").addEventListener("click", event => {
    const button = event.target.closest("[data-ticket-id]");
    if (!button) return;
    const ticket = state.tickets.find(t => String(t.id) === button.dataset.ticketId);
    if (ticket) openDetail(ticket);
  });
  $("supportDetailBack").addEventListener("click", () => {
    ticketSection.hidden = true;
    document.querySelector(".support-page").classList.remove("is-detail");
    $("supportRequestsTitle").scrollIntoView({behavior:"smooth",block:"start"});
  });
  function renderFiles() {
    const list = $("supportAttachmentList");list.replaceChildren();
    if (!state.files.length) {
      list.append(element("p", "support-attachments-empty", "No files attached."));
      return;
    }
    state.files.forEach((file, index) => {
      const row = element("div", "support-attachment-row");
      const ext = file.name.split(".").pop().toUpperCase();
      row.append(element("span", "support-file-type-label", ext));
      const info = element("span", "support-file-details");
      info.append(element("span", "support-file-name", file.name), element("span", "support-file-size", formatSize(file.size)));
      row.append(info);
      const actions = element("span", "support-file-actions");
      const view = element("button", "support-file-action", "◉");view.type="button";view.title="Preview file";
      view.addEventListener("click", () => {
        if (!["image/jpeg","image/png","application/pdf"].includes(file.type)) {toast("This file type cannot be previewed in the browser.");return;}
        const url = URL.createObjectURL(file);
        window.open(url,"_blank","noopener");setTimeout(()=>URL.revokeObjectURL(url),60000);
      });
      const remove = element("button", "support-file-action", "×");remove.type="button";remove.title="Remove file";
      remove.addEventListener("click", () => {state.files.splice(index,1);renderFiles();});
      actions.append(view,remove); row.append(actions); list.append(row);
    });
  }
  function addFiles(incoming) {
    let error="";
    for (const file of incoming) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (!ALLOWED.has(ext)) {error=`Unsupported file type: ${file.name}`;break;}
      if (file.size > MAX_FILE) {error=`${file.name} exceeds 20 MB.`;break;}
      if (state.files.length >= 4) {error="Maximum 4 attachments per support request.";break;}
      if (state.files.reduce((n,f)=>n+f.size,0)+file.size > MAX_TOTAL) {error="All attachments combined must be under 25 MB.";break;}
      state.files.push(file);
    }
    const msg = $("supportFileFeedback");msg.textContent=error || (incoming.length?"Files added.":"");
    msg.classList.toggle("is-error",!!error);
    renderFiles();
    $("supportFileInput").value="";
  }
  $("supportFileInput").addEventListener("change", event => addFiles([...event.target.files]));
  $("supportDropzone").addEventListener("dragover", e => {e.preventDefault();e.currentTarget.classList.add("is-dragging");});
  $("supportDropzone").addEventListener("dragleave", e => e.currentTarget.classList.remove("is-dragging"));
  $("supportDropzone").addEventListener("drop", e => {e.preventDefault();e.currentTarget.classList.remove("is-dragging");addFiles([...e.dataTransfer.files]);});
  const contactForm = $("supportContactForm");
  contactForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (state.busy || !contactForm.reportValidity()) return;
    const msg = $("supportSubmitStatus"); msg.classList.remove("is-success");
    if (!state.csrfToken) {msg.textContent="Support API is not connected. Check the database migration and refresh the page.";return;}
    const data = new FormData(contactForm);data.append("csrf_token",state.csrfToken);
    for (const file of state.files) data.append("attachments[]",file,file.name);
    state.busy=true;const submit = contactForm.querySelector("[type='submit']");submit.disabled=true;
    msg.textContent="Saving your support request…";
    try {
      const response = await fetch(API,{method:"POST",body:data,credentials:"same-origin",headers:{Accept:"application/json"}});
      const result=await response.json().catch(()=>({}));
      if(!response.ok || !result.success) throw new Error(result.message || `Unable to save request (HTTP ${response.status}).`);
      msg.textContent=`Saved ${result.ticket_number} successfully. You can view it in Recent support requests above.`;
      msg.classList.add("is-success");
      contactForm.reset();state.files=[];renderFiles();state.showAll=false;
      try { await loadTickets(); }
      catch (refreshError) { console.error("Ticket saved; list refresh failed:",refreshError); msg.textContent += " Refresh this page to update the ticket list."; }
      $("supportRequestsTitle").scrollIntoView({behavior:"smooth",block:"start"});
    } catch(error) {msg.textContent=error.message;msg.classList.remove("is-success");}
    finally {state.busy=false;submit.disabled=false;}
  });
  $("notificationButton").addEventListener("click",()=>toast("Manager notifications are not connected yet."));
  $("signOutButton").addEventListener("click",()=>toast("Sign-out is managed by the HR login module."));
  document.querySelectorAll("[data-soon]").forEach(b=>b.addEventListener("click",()=>toast(`${b.dataset.soon} is not connected yet.`)));
  renderFiles();
  loadTickets().catch(error=>{
    $("managerSupportError").textContent=`Support database is not ready: ${error.message}`;
    $("managerSupportError").hidden=false;
    $("supportTicketsBody").replaceChildren();
    const row=element("tr"),col=element("td","support-table-empty","Unable to load support tickets. Install the SQL table and PHP API files from the ZIP.");col.colSpan=6;row.append(col);$("supportTicketsBody").append(row);
    console.error("Manager Support:",error);
  });
});
