"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(window.location.search);
  const demo = query.get("demo") === "1";
  const number = query.get("invoice_number") || "";
  const shouldPrint = query.get("print") === "1";
  const peso = n => n === null || n === undefined || n === "" ? "—" : "Php. " + new Intl.NumberFormat("en-PH", {minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n));
  const formatDate = raw => {
    if (!raw) return "—";
    const d = new Date(String(raw).slice(0,10) + "T00:00:00");
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH", {month:"long",day:"numeric",year:"numeric"});
  };
  const set = (id, value) => {$(id).textContent = value == null || value === "" ? "—" : String(value);};
  const showError = message => {$("loading").hidden = true;set("errorBanner", message);$("errorBanner").hidden = false;};
  const toast = message => {const t=$("toast"); t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),3500);};
  function updateBuyer(user){const name=String(user?.full_name||"Buyer"), email=String(user?.email||"—");set("buyerName",name);set("buyerEmail",email);set("buyerInitial",name.trim().charAt(0).toUpperCase()||"B");}
  function displayQty(value,unit){if(value===undefined||value===null||value==="")return "—";const n=Number(value);return `${Number.isFinite(n)?new Intl.NumberFormat("en-PH",{maximumFractionDigits:3}).format(n):value}${unit?" "+unit:""}`;}
  const sample = {
    buyer:{full_name:"Buyer",email:"buyer@gmail.com"},
    invoice:{invoice_number:"INV-2026-0004", supplier_invoice_number:"SUP-INV-2026-1478",invoice_date:"2026-10-25",due_date:"2026-11-24",po_number:"PO-2026-04",gr_reference:"GR-0004",supplier_name:"SynthHide Textile Corp.",payment_terms:"Net 30",status:"ready_to_post",subtotal:36580,vat_amount:4389.6,total_amount:40969.6},
    items:[
      {item_name:"Canvas Fabric",ordered_quantity:100,gr_received_quantity:100,invoice_quantity:100,unit:"meters",unit_price:95,line_total:9500},
      {item_name:"PU Leather",ordered_quantity:80,gr_received_quantity:75,invoice_quantity:75,unit:"meters",unit_price:145,line_total:11600},
      {item_name:"Nubuck Leather",ordered_quantity:60,gr_received_quantity:60,invoice_quantity:60,unit:"sq. ft.",unit_price:258,line_total:15480}
    ]
  };
  function labelStatus(value){const s=String(value||"pending").toLowerCase();if(["ready","ready_to_post","matched","verified"].includes(s))return["Ready to Post","ready"];if(["posted","paid","closed","accounting_posted"].includes(s))return["Posted","posted"];if(["discrepancy","mismatch","flagged","rejected","on_hold"].includes(s))return["Discrepancy","discrepancy"];return["Pending Match","pending"];}
  function makeItemRow(item,index){const tr=document.createElement("tr");const unit=String(item.unit||"");const cols=[index+1,item.item_name||"—",displayQty(item.ordered_quantity,unit),displayQty(item.gr_received_quantity,unit),displayQty(item.invoice_quantity,unit),peso(item.unit_price),peso(item.line_total)];for(const value of cols){const td=document.createElement("td");td.textContent=String(value);tr.append(td);}return tr;}
  function render(payload, isDemo){
    const i=payload.invoice, items=Array.isArray(payload.items)?payload.items:[];
    updateBuyer(payload.buyer||{});set("headerNumber",i.invoice_number);set("invoiceNumber",i.invoice_number);set("supplierInvoiceNumber",i.supplier_invoice_number);set("invoiceDate",formatDate(i.invoice_date));set("dueDate",formatDate(i.due_date));
    set("poReference",i.po_number||"—");set("grReference",isDemo?i.gr_reference||"—":i.gr_reference?`${i.gr_reference} (not independently verified)`:"Not verified");set("supplier",i.supplier_name);set("paymentTerms",i.payment_terms);
    const [label,cls]=labelStatus(i.status);set("statusBadge",isDemo?"Demo · "+label:label);$("statusBadge").className=`status-badge ${isDemo?"demo":cls}`;
    $("demoBanner").hidden=!isDemo;$("dataBanner").hidden=isDemo;
    set("matchResult",isDemo?"☑ 3-Way Match Result: Sample illustration only":"Not verified — Inventory GR data unavailable");$("matchResult").classList.toggle("sample",false);
    set("sourceHint",isDemo?"Figma illustration only. This invoice, goods receipt and 3-way match do not exist in MySQL.":"Received (GR) values are intentionally blank until Inventory Goods Receipt records are linked and verified. PO ordered quantities alone do not prove receipt.");
    const body=$("itemRows");body.replaceChildren();
    if(items.length){items.forEach((item,j)=>body.append(makeItemRow(item,j)));}else{const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=7;cell.textContent="No invoice line items are recorded for this invoice.";row.append(cell);body.append(row);}
    set("subtotal",peso(i.subtotal));set("vat",peso(i.vat_amount));set("totalAmount",peso(i.total_amount));
    $("loading").hidden=true;$("invoiceSheet").hidden=false;
    $("discrepancyButton").disabled=true;$("discrepancyButton").title="Requires a verified discrepancy workflow and Inventory records.";
    $("postButton").disabled=true;$("postButton").title="Finance posting is unavailable until a verified 3-way match and Finance integration exist.";
    if(shouldPrint)requestAnimationFrame(()=>setTimeout(()=>window.print(),150));
  }
  $("printButton").addEventListener("click",()=>window.print());
  $("bellButton").addEventListener("click",()=>toast("Notifications are not connected on this view yet."));
  if(demo){render(sample,true);return;}
  if(!number){showError("No invoice selected. Return to the Invoice Dashboard and click View Invoice.");return;}
  (async()=>{
    try{
      const response=await fetch("../database/get-buyer-invoice-details.php?invoice_number="+encodeURIComponent(number),{credentials:"same-origin",headers:{Accept:"application/json"},cache:"no-store"});
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error(result.message||`HTTP ${response.status}`);
      render(result,false);
    }catch(error){showError(error.message||"Unable to retrieve Invoice Details.");}
  })();
});
