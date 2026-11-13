"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const state = { invoices: [], actualInvoices: [], sampleVisible: false, status: "all", search: "", selected: null };

  // Figma-only visual sample. Never saved or sent to MySQL / Finance.
  const FIGMA_SAMPLE = Object.freeze({
    invoice_number: "INV-2026-0004",
    status: "ready_to_post",
    supplier_name: "SynthHide Textile Corp.",
    po_number: "PO-2026-04",
    po_id: "04",
    gr_reference: "GR-0004",
    payment_terms: "Net 30",
    total_amount: 40969.60,
    item_summary: "Canvas Fabric, PU Leather, Nubuck Leather",
    item_count: 3,
    invoice_date: "2026-10-25",
    due_date: "2026-11-24",
    created_at: "2026-10-25 08:00:00",
    __figma_demo: true
  });

  function setSampleMode(on) {
    const available = state.actualInvoices.length === 0;
    state.sampleVisible = Boolean(available && on);
    state.invoices = state.sampleVisible ? [FIGMA_SAMPLE] : state.actualInvoices;
    const note = $("invoiceDemoNotice");
    note.hidden = !available;
    if (available) {
      $("invoiceDemoText").textContent = state.sampleVisible
        ? "FIGMA SAMPLE PREVIEW — This example is NOT in MySQL. No 3-way match or Finance posting has occurred."
        : "DATABASE VIEW — There are 0 invoice records assigned to the current Buyer.";
      $("toggleDemoPreview").textContent = state.sampleVisible
        ? "Show actual 0 records" : "Show Figma sample";
    }
    state.status = "all";
    state.search = "";
    $("searchInput").value = "";
    render();
  }
  const names = { all: "All Invoices", pending: "Pending Match", ready: "Ready to Post", posted: "Posted", discrepancy: "Discrepancy" };
  const peso = n => new Intl.NumberFormat("en-PH", {style:"currency",currency:"PHP"}).format(Number(n)||0);
  const formatDate = str => {
    if (!str) return "—";
    const d = new Date(`${String(str).slice(0,10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH",{month:"short",day:"2-digit",year:"numeric"});
  };
  const el = (tag, className, content) => {const x=document.createElement(tag);if(className)x.className=className;if(content!==undefined)x.textContent=String(content);return x};
  function group(i) {
    const s = String(i.status||"pending").toLowerCase().trim();
    if (["posted","paid","closed","accounting_posted"].includes(s)) return "posted";
    if (["ready_to_post","ready","matched","verified"].includes(s)) return "ready";
    if (["discrepancy","mismatch","flagged","rejected","on_hold"].includes(s)) return "discrepancy";
    return "pending"; // Pending status is NOT proof of verified 3-way match.
  }
  function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),3200)}
  

function updateIdentity(buyer) {
  const name = "Buyer";
  const email = "buyer@gmail.com";
  const letter = "B";

  for (const id of ["topName", "sideName"]) {
    $(id).textContent = name;
  }

  for (const id of ["topEmail", "sideEmail"]) {
    $(id).textContent = email;
  }

  for (const id of ["topInitial", "sideInitial"]) {
    $(id).textContent = letter;
  }
}



  function counts(){for(const g of ["pending","ready","posted","discrepancy"]){const elCount=$("count"+g[0].toUpperCase()+g.slice(1));elCount.textContent=state.invoices.filter(i=>group(i)===g).length;}}
  function makeCard(invoice){const g=group(invoice),card=el("article","invoice-card");
    const top=el("div","card-heading"),number=el("span","badge",invoice.invoice_number||"Invoice"),status=el("span",`badge ${g}`,invoice.__figma_demo?"Demo · Ready to Post":(invoice.source_kind==="demo"&&invoice.match_status==="demo_ready"?"CLASSROOM DEMO · Ready to Post":names[g]));top.append(number,status);
    const title=el("h2","invoice-title",invoice.supplier_name||invoice.item_summary||`Invoice ${invoice.invoice_number||""}`);
    const meta=el("div","invoice-meta");meta.append(el("span","meta-tag",invoice.po_number||`PO ID ${invoice.po_id||"—"}`));
    if (invoice.gr_reference) meta.append(el("span","meta-tag",invoice.gr_reference));
    meta.append(el("span","meta-tag",`${invoice.item_count||0} item(s)`));
    if (invoice.payment_terms) meta.append(el("span","meta-tag",invoice.payment_terms));
    const amount=el("strong","amount",`Total Amount: ${peso(invoice.total_amount)}`),due=el("div","due",`Due Date: ${formatDate(invoice.due_date)}`);
    const match=el("p","match-label",invoice.__figma_demo?"3-Way Match: Figma illustration only (not verified)":(invoice.source_kind==="demo"&&invoice.match_status==="demo_ready"?"3-Way Match: CLASSROOM DEMO only — Finance posting is disabled":g==="ready"?"Stored status: Ready to Post (GR match not reverified here)":g==="posted"?"Stored status: Posted to Accounting":g==="discrepancy"?"Needs review before posting":"Awaiting verified PO–GR–Invoice match");
    const actions=el("div","card-actions"),print=el("button","", "Print"),view=el("button","","View Invoice");print.type="button";view.type="button";
    
    const detailUrl = invoice.__figma_demo
      ? "buyer-view-invoice.html?demo=1"
      : "buyer-view-invoice.html?invoice_number=" +
        encodeURIComponent(invoice.invoice_number || "");

    print.addEventListener("click", () => {
      window.location.href = detailUrl + "&print=1";
    });

    view.addEventListener("click", () => {
      window.location.href = detailUrl;
    });

    actions.append(print, view);

    if (invoice.__figma_demo) {
      const sampleBadge=el("span","sample-notice","SAMPLE DATA · Not a real invoice");
      card.append(sampleBadge);
    }
    card.append(top,title,meta,amount,due,match,actions);return card;
  }
  function render(){counts();document.querySelectorAll("[data-status]").forEach(b=>{const chosen=b.dataset.status===state.status;b.classList.toggle("selected",chosen);b.setAttribute("aria-pressed",String(chosen))});$("filterLabel").textContent=names[state.status]||names.all;
    const results=state.invoices.filter(i=>(state.status==="all"||group(i)===state.status)&&[i.invoice_number,i.item_summary,i.status,i.po_id,String(i.total_amount)].join(" ").toLowerCase().includes(state.search));
    $("resultsCount").textContent=`${results.length} invoice${results.length===1?"":"s"}`;
    const container=$("invoiceCards");container.replaceChildren();if(!results.length){container.append(el("p","empty-state",state.invoices.length?"No invoices match your filters.":"No invoice records for this Buyer yet."));return;}results.forEach(i=>container.append(makeCard(i)));
  }
  function choose(status){state.status=status;$("filterMenu").hidden=true;$("filterButton").setAttribute("aria-expanded","false");render();}
  function openPreview(invoice){state.selected=invoice;$("dialogTitle").textContent=invoice.invoice_number||"Invoice";const list=$("dialogDetails");list.replaceChildren();const fields=[["Invoice Number",invoice.invoice_number],
      ["Record Type",invoice.__figma_demo?"Figma Sample — Not in MySQL":"Saved Procurement Invoice"],
      ["Stored Status",invoice.__figma_demo?"Sample Ready to Post":invoice.status],
      ["Supplier",invoice.supplier_name||"—"],
      ["PO Number",invoice.po_number||invoice.po_id||"—"],
      ["GR Reference",invoice.gr_reference||"Not confirmed"],
      ["Payment Terms",invoice.payment_terms||"—"],
      ["PO ID",invoice.po_id],["Items",invoice.item_summary||"Not available"],["Invoice Date",formatDate(invoice.invoice_date)],["Due Date",formatDate(invoice.due_date)],["Total Amount",peso(invoice.total_amount)],["Recorded At",invoice.created_at||"—"]];for(const [label,val] of fields){const wrapper=el("div"),dt=el("dt","",label),dd=el("dd","",val??"—");wrapper.append(dt,dd);list.append(wrapper)}$("invoiceDialog").showModal();}
  document.querySelectorAll("[data-status]").forEach(b=>b.addEventListener("click",()=>choose(b.dataset.status)));
  document.querySelectorAll("[data-status-choice]").forEach(b=>b.addEventListener("click",()=>choose(b.dataset.statusChoice)));
  $("searchForm").addEventListener("submit",e=>{e.preventDefault();state.search=$("searchInput").value.trim().toLowerCase();render()});
  $("searchInput").addEventListener("input",()=>{state.search=$("searchInput").value.trim().toLowerCase();render()});
  $("filterButton").addEventListener("click",()=>{const menu=$("filterMenu");menu.hidden=!menu.hidden;$("filterButton").setAttribute("aria-expanded",String(!menu.hidden))});
  document.addEventListener("click",e=>{if(!e.target.closest(".filter-container")){$("filterMenu").hidden=true;$("filterButton").setAttribute("aria-expanded","false")}});
  $("bellButton").addEventListener("click",()=>toast("No notifications available yet."));
  document.querySelectorAll("[data-notice]").forEach(b=>b.addEventListener("click",()=>toast(b.dataset.notice)));
  for(const id of ["closeDialog","closeInvoice"])$(id).addEventListener("click",()=>$("invoiceDialog").close());
  $("invoiceDialog").addEventListener("click",e=>{if(e.target===$("invoiceDialog"))$("invoiceDialog").close()});
  $("printInvoice").addEventListener("click",()=>window.print());
  $("toggleDemoPreview").addEventListener("click", () => setSampleMode(!state.sampleVisible));
  (async()=>{try{const response=await fetch("../database/get-buyer-invoices.php",{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||`HTTP ${response.status}`);state.actualInvoices=Array.isArray(data.invoices)?data.invoices:[];updateIdentity(data.buyer||{});setSampleMode(state.actualInvoices.length===0)}catch(error){$("errorMessage").textContent=error.message;$("errorMessage").hidden=false;$("invoiceCards").replaceChildren(el("p","empty-state","Invoices could not be loaded."));$("resultsCount").textContent="Unavailable";}})();
});
