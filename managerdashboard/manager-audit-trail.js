"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const API = "../database/get-manager-audit-trail.php";
  const state = {search:"", role:"all", action:"all", period:"all", page:1, pages:1, busy:false};
  const num = value => new Intl.NumberFormat("en-PH").format(Number(value)||0);
  const create = (name, className, content) => {
    const el = document.createElement(name);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = String(content);
    return el;
  };
  let timer, loadId = 0;
  function toast(message) {
    const el = $("auditToast");
    el.textContent = message; el.hidden = false;
    clearTimeout(timer);timer = setTimeout(() => {el.hidden = true;}, 3500);
  }
  function identity(manager) {
    const name = String(manager?.full_name||"Manager");
    const email = String(manager?.email||"—");
    const first = name.trim().split(/\s+/)[0] || "Manager";
    const initial = first.charAt(0).toUpperCase() || "M";
    $("welcomeText").textContent = `Welcome ${first}!`;
    for(const id of ["sidebarManagerName", "topbarManagerName"]) $(id).textContent = name;
    for(const id of ["sidebarManagerEmail", "topbarManagerEmail"]) $(id).textContent = email;
    for(const id of ["sidebarAvatar", "topbarAvatar"]) $(id).textContent = initial;
  }
  function filters() {
    return new URLSearchParams({search:state.search,role:state.role,action:state.action,period:state.period,page:String(state.page)});
  }
  function timestamp(value) {
    if (!value) return "—";
    const str = String(value).replace(" ","T");
    const date = new Date(str);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-PH",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true});
  }
  function renderRows(entries) {
    const body = $("auditRows");body.replaceChildren();
    if (!entries.length) {
      const row = create("tr"), cell = create("td","audit-empty","No recorded activities match these filters. New events appear after audit hooks are installed and a PR/PO action occurs.");
      cell.colSpan = 7;row.append(cell);body.append(row);return;
    }
    entries.forEach(entry => {
      const row = create("tr");
      row.append(create("td","",timestamp(entry.timestamp)));
      row.append(create("td","user-name",entry.user_name || "—"));
      const roleName = String(entry.role||"—");row.append(create("td","",roleName.charAt(0).toUpperCase()+roleName.slice(1)));
      row.append(create("td","",entry.module || "—"));
      const cell = create("td"),action = String(entry.action || "").toLowerCase();
      cell.append(create("span",`action-pill ${action}`,action ? action.charAt(0).toUpperCase()+action.slice(1):"—"));row.append(cell);
      row.append(create("td","",entry.description || entry.reference || "—"));
      row.append(create("td","",entry.ip_address || "Not recorded"));
      body.append(row);
    });
  }
  function pagination(current,total) {
    const nav = $("auditPagination");nav.replaceChildren();
    const add = (label,target,disabled,currentPage=false) => {
      const button = create("button","",label);button.type="button";
      button.disabled=Boolean(disabled);if (currentPage) button.setAttribute("aria-current","page");
      button.setAttribute("aria-label",label === "‹" ? "Previous page" : label === "›" ? "Next page" : `Page ${label}`);
      button.addEventListener("click",()=>{state.page=target;load();});nav.append(button);
    };
    add("‹",Math.max(1,current-1),current<=1);
    const start = Math.max(1,Math.min(current-2,total-4));
    const end = Math.min(total,start+4);
    for(let p=start;p<=end;p++)add(String(p),p,false,p===current);
    add("›",Math.min(total,current+1),current>=total);
  }
  async function load() {
    const current = ++loadId;
    $("auditError").hidden = true;
    $("resultSummary").textContent = "Loading activities…";
    try {
      const response = await fetch(`${API}?${filters()}`,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message||`HTTP ${response.status}`);
      if(current !== loadId) return;
      identity(data.manager||{});
      const info = data.summary||{};
      for(const [id,key] of [["totalActivities","total_activities"],["thisWeek","this_week"],["todayCount","today"],["pendingActions","pending_actions"]]){
        $(id).textContent=num(info[key]);
      }
      state.page=Number(data.page)||1;state.pages=Number(data.pages)||1;
      renderRows(Array.isArray(data.entries)?data.entries:[]);
      const total = Number(data.count)||0;
      const from = total===0?0:(state.page-1)*5+1;
      const to = Math.min(total,state.page*5);
      $("resultSummary").textContent=`Showing ${from}–${to} of ${num(total)} recorded activities`;
      pagination(state.page,state.pages);
    } catch(error) {
      if(current !== loadId) return;
      $("auditError").textContent=error.message;
      $("auditError").hidden=false;
      $("resultSummary").textContent="Audit Trail unavailable";
      renderRows([]);$("auditPagination").replaceChildren();
    }
  }
  const menu=$("auditFilterMenu"),menuButton=$("auditFilterButton");
  function showMenu(on){menu.hidden=!on;menuButton.setAttribute("aria-expanded",String(on));}
  menuButton.addEventListener("click",()=>showMenu(menu.hidden));
  document.addEventListener("click",e=>{if(e.target instanceof Element && !e.target.closest(".audit-filter-wrap"))showMenu(false);});
  $("auditSearchForm").addEventListener("submit",e=>{e.preventDefault();state.search=$("auditSearch").value.trim();state.page=1;load();});
  let debounce;
  $("auditSearch").addEventListener("input",()=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.search=$("auditSearch").value.trim();state.page=1;load();},350);});
  $("roleFilter").addEventListener("change",()=>{state.role=$("roleFilter").value;state.page=1;load();});
  $("actionFilter").addEventListener("change",()=>{state.action=$("actionFilter").value;state.page=1;load();});
  $("periodFilter").addEventListener("change",()=>{state.period=$("periodFilter").value;state.page=1;load();});
  $("filterReset").addEventListener("click",()=>{
    state.role="all";state.action="all";state.period="all";state.page=1;
    $("roleFilter").value="all";$("actionFilter").value="all";$("periodFilter").value="all";
    showMenu(false);load();
  });
  $("exportCsv").addEventListener("click",()=>{
    const params=filters();params.set("export","csv");
    window.location.assign(`${API}?${params.toString()}`);
  });
  $("exportPdf").addEventListener("click",()=>{
    toast("Print / Save as PDF exports the currently visible filtered page.");
    window.print();
  });
  $("notificationButton").addEventListener("click",()=>toast("Manager notifications are not connected yet."));
  $("signOutButton").addEventListener("click",()=>toast("Sign-out is managed by HR login."));
  document.querySelectorAll("[data-soon]").forEach(b=>b.addEventListener("click",()=>toast(`${b.dataset.soon} is not connected yet.`)));
  load();
});
