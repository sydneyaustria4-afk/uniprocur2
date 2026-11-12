/* Buyer Invoice modal addon. Keeps original buyer-invoices HTML/CSS/cards intact.
 * Local XAMPP only. The server decides eligibility, not this script. */
"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const recordButton = document.querySelector('a.new-po[href="purchase-orders.html"], a.new-po[data-invoice-record="1"], a.new-po');
  if (!recordButton) return;
  recordButton.textContent = "+ Record Invoice";
  recordButton.setAttribute("href", "#record-invoice");
  recordButton.setAttribute("data-invoice-record", "1");

  const dialog = document.createElement("dialog");
  dialog.id = "invoiceRecordDialog";
  dialog.className = "invoice-capture-dialog";
  dialog.setAttribute("aria-labelledby", "invoiceCaptureTitle");
  dialog.innerHTML = `
    <header class="capture-head"><div><small>UniProcur · Buyer</small><h2 id="invoiceCaptureTitle">Record Supplier Invoice</h2></div>
      <button type="button" class="capture-close" aria-label="Close Invoice form" id="captureClose">×</button></header>
    <p class="capture-warning">LOCAL INTEGRATION: A recorded invoice does not mean payment. Finance posting and budget deduction are disabled. The Invoice dashboard design stays unchanged.</p>
    <p class="capture-message" id="captureMessage" role="status">Choose an approved Purchase Order with real Inventory Goods Receipts.</p>
    <div class="capture-po-picker"><label for="capturePoSelect">Purchase Order</label><select id="capturePoSelect"></select><button type="button" id="captureLoadPo">Load PO</button></div>
    <div class="capture-po-info" id="capturePoInfo" hidden></div>
    <form id="captureInvoiceForm" hidden>
      <div class="capture-grid">
        <label>Source of invoice
          <select id="captureSource" required><option value="demo">Classroom DEMO / sample</option><option value="supplier_document">Actual supplier invoice reviewed</option></select>
        </label>
        <label>Supplier invoice reference <input type="text" id="captureSupplierRef" placeholder="e.g. DEMO-SUP-0004" maxlength="80" required></label>
        <label>Invoice date <input type="date" id="captureInvoiceDate" required></label>
        <label>Due date <input type="date" id="captureDueDate" required></label>
      </div>
      <label class="capture-doc-check" id="captureDocumentBox" hidden><input type="checkbox" id="captureDocumentChecked"> I personally reviewed the genuine supplier-issued invoice document. (Do not check for demo data.)</label>
      <label class="capture-notes-label">Notes (optional)<input id="captureNotes" type="text" maxlength="255" placeholder="Supplier invoice notes"></label>
      <div class="capture-table-wrap"><table><thead><tr><th>Item</th><th>Ordered</th><th>Received</th><th>Billed now</th><th>PO unit price</th><th>Invoice unit price</th><th>Line total</th></tr></thead><tbody id="captureLineRows"></tbody></table></div>
      <div class="capture-total-row"><span>Calculated line total: <strong id="captureCalculated">—</strong></span><label>Supplier invoice total (pre-VAT) <input id="captureInvoiceTotal" type="number" min="0.01" step="0.01" required></label></div>
      <p class="capture-tax-note">This local version supports pre-VAT matching only. Do not force a VAT-inclusive supplier invoice amount to match a pre-VAT PO.</p>
      <div class="capture-actions"><button type="submit" id="captureSave">Save as Pending Match</button><button type="button" id="captureVerify">Verify 3-Way Match</button><a id="captureViewInvoice" href="#" hidden>View Invoice</a></div>
    </form>
    <section class="capture-result" id="captureResult" hidden><h3>3-Way Match Checks</h3><div id="captureChecks"></div></section>`;
  document.body.append(dialog);

  const $ = id => dialog.querySelector("#" + id);
  const state = {csrf:"", po:null, items:[], invoice:null, invoice_items:[], match:null, orders:[], wrote:false, busy:false};
  const amt = value => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(value)||0);
  const localDate = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
  const setMessage = (msg,type="") => {const el=$("captureMessage");el.textContent=msg;el.dataset.kind=type;};
  const make = (tag,text) => {const e=document.createElement(tag); if(text !== undefined)e.textContent=String(text);return e;};
  function refreshTotal() {
    let total=0;
    for (const tr of $("captureLineRows").children) {
      const q=Number(tr.querySelector("[data-qty]")?.value||0), p=Number(tr.querySelector("[data-price]")?.value||0);
      const v=Math.round(q*p*100)/100;
      tr.querySelector("[data-line-total]").textContent=amt(v);total+=v;
    }
    $("captureCalculated").textContent=amt(total);
  }
  function appendText(parent,tag,text) {const node=make(tag,text);parent.append(node);return node;}
  function render() {
    const select=$("capturePoSelect"); select.replaceChildren();
    for (const item of state.orders) {const o=make("option",`${item.po_number} — ${item.status}`);o.value=item.po_number;select.append(o);}
    if (state.po) select.value=state.po.po_number;
    const po=state.po;
    $("captureInvoiceForm").hidden = !po;
    $("capturePoInfo").hidden = !po;
    $("captureResult").hidden = !po || !state.invoice;
    if (!po) { setMessage("No eligible PO. Record real Inventory Goods Receipts first.");return;}
    $("capturePoInfo").replaceChildren();
    for (const [label,value] of [["Purchase Order",po.po_number],["PO status",po.status],["Supplier",po.supplier_name],["PO Total (pre-VAT)",amt(po.total_amount)]]) {
      const box=make("div");appendText(box,"small",label);appendText(box,"strong",value);$("capturePoInfo").append(box);
    }
    const inv=state.invoice;
    $("captureSource").value=inv?.source_kind||"demo";
    $("captureSupplierRef").value=inv?.supplier_invoice_reference||"";
    $("captureNotes").value=inv?.source_notes||"";
    $("captureDocumentChecked").checked=Number(inv?.document_checked||0)===1;
    $("captureDocumentBox").hidden=$("captureSource").value!=="supplier_document";
    $("captureInvoiceDate").value=inv?.invoice_date||localDate();
    const due=new Date();due.setDate(due.getDate()+30);
    $("captureDueDate").value=inv?.due_date||[due.getFullYear(),String(due.getMonth()+1).padStart(2,"0"),String(due.getDate()).padStart(2,"0")].join("-");
    $("captureInvoiceTotal").value=inv?.total_amount||po.total_amount;
    const saved=new Map(state.invoice_items.map(x=>[Number(x.po_item_id),x]));
    $("captureLineRows").replaceChildren();
    for (const line of state.items) {
      const id=Number(line.po_item_id), existing=saved.get(id), tr=make("tr");
      appendText(tr,"td",`${line.item_name} (${line.unit})`);
      appendText(tr,"td",line.qty_ordered);appendText(tr,"td",line.qty_received);
      const tdQty=make("td"), q=make("input");q.type="number";q.min="0.01";q.step="0.01";q.required=true;q.value=existing?existing.qty_billed:line.qty_received;q.dataset.qty=id;tdQty.append(q);tr.append(tdQty);
      appendText(tr,"td",amt(line.unit_price));
      const tdPrice=make("td"),p=make("input");p.type="number";p.min="0.01";p.step="0.01";p.required=true;p.value=existing?existing.unit_price:line.unit_price;p.dataset.price=id;tdPrice.append(p);tr.append(tdPrice);
      const tdTotal=make("td");tdTotal.dataset.lineTotal=id;tr.append(tdTotal);
      q.addEventListener("input",refreshTotal);p.addEventListener("input",refreshTotal);
      $("captureLineRows").append(tr);
    }
    refreshTotal();
    const editable=!inv||["pending_match","discrepancy"].includes(String(inv.status).toLowerCase());
    for(const field of $("captureInvoiceForm").querySelectorAll("input,select"))field.disabled=!editable;
    $("captureSave").disabled=!editable;
    $("captureSave").textContent=inv?"Update Invoice as Pending Match":"Save Invoice as Pending Match";
    $("captureVerify").disabled=!inv||!["pending_match","discrepancy","ready_to_post"].includes(String(inv.status).toLowerCase());
    $("captureViewInvoice").hidden=!inv;
    if (inv) $("captureViewInvoice").href="buyer-view-invoice.html?invoice_number="+encodeURIComponent(inv.invoice_number);
    $("captureChecks").replaceChildren();
    if (state.match) {
      for(const c of state.match.checks) {const p=make("p",`${c.passed?"✓":"✕"} ${c.message}`);p.className=c.passed?"capture-pass":"capture-fail";$("captureChecks").append(p);}
      for(const c of state.match.items) {const ok=c.receipt_matched&&c.invoice_quantity_matched&&c.price_matched&&c.line_identity_matched;
        const p=make("p",`${ok?"✓":"✕"} ${c.item_name}: PO ${c.po_qty}, GR ${c.real_gr_accepted}, invoice ${c.invoice_qty??"—"}, PO unit price ${amt(c.po_unit_price)}, invoice ${amt(c.invoice_unit_price)}`);p.className=ok?"capture-pass":"capture-fail";$("captureChecks").append(p);}
    }
    setMessage(inv?`Invoice ${inv.invoice_number} · ${inv.status} · ${inv.source_kind==="demo"?"DEMO only":"Supplier-document declaration"}`:`PO ${po.po_number} loaded. Record the supplier invoice before verification.`,"ok");
  }
  async function load(poNumber="") {
    setMessage("Loading Purchase Order and real Inventory Goods Receipts...");
    const response=await fetch("../database/buyer-invoice-integration-local.php?po_number="+encodeURIComponent(poNumber),{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    const d=await response.json().catch(()=>({}));
    if(!response.ok||!d.success)throw new Error(d.message||`HTTP ${response.status}`);
    Object.assign(state,{csrf:d.csrf_token||"",po:d.po,items:d.po_items||[],invoice:d.invoice,invoice_items:d.invoice_items||[],match:d.match,orders:d.orders||[]});
    render();
  }
  async function post(data) {
    const response=await fetch("../database/buyer-invoice-integration-local.php",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Accept:"application/json","X-CSRF-Token":state.csrf},body:JSON.stringify(data)});
    const d=await response.json().catch(()=>({}));
    if(!response.ok||!d.success)throw new Error(d.message||`HTTP ${response.status}`);
    return d;
  }
  async function withBusy(work) {if(state.busy)return;state.busy=true;$("captureSave").disabled=true;$("captureVerify").disabled=true;
    try{await work();}catch(e){setMessage(e.message||"Invoice action failed.","error");}finally{state.busy=false;
      const inv=state.invoice;
      const editable=!inv||["pending_match","discrepancy"].includes(String(inv.status).toLowerCase());
      $("captureSave").disabled=!editable;
      $("captureVerify").disabled=!inv||!["pending_match","discrepancy","ready_to_post"].includes(String(inv.status).toLowerCase());
    }
  }
  recordButton.addEventListener("click", async e => {
    e.preventDefault();dialog.showModal();
    try{await load("PO-2026-0004");}catch(e){
      // A new or different PO may be appropriate; the server will choose the latest eligible PO.
      try{await load("");}catch(f){setMessage(f.message||"Unable to load invoices","error");}
    }
  });
  $("captureClose").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener("close",()=>{if(state.wrote)location.reload();});
  $("captureLoadPo").addEventListener("click",()=>withBusy(async()=>{await load($("capturePoSelect").value);}));
  $("captureSource").addEventListener("change",()=>{$("captureDocumentBox").hidden=$("captureSource").value!=="supplier_document";if($("captureDocumentBox").hidden)$("captureDocumentChecked").checked=false;});
  $("captureInvoiceForm").addEventListener("submit",e=>{e.preventDefault();withBusy(async()=>{
    if(!state.po)throw new Error("Select a PO first.");
    const lines=[...$("captureLineRows").children].map(tr=>({po_item_id:Number(tr.querySelector("[data-qty]").dataset.qty),qty_billed:tr.querySelector("[data-qty]").value,unit_price:tr.querySelector("[data-price]").value}));
    const result=await post({action:"save",po_number:state.po.po_number,source_kind:$("captureSource").value,supplier_invoice_reference:$("captureSupplierRef").value.trim(),source_notes:$("captureNotes").value.trim(),document_checked:$("captureDocumentChecked").checked,invoice_date:$("captureInvoiceDate").value,due_date:$("captureDueDate").value,total_amount:$("captureInvoiceTotal").value,items:lines});
    state.wrote=true;await load(state.po.po_number);setMessage(result.message,"ok");
  });});
  $("captureVerify").addEventListener("click",()=>withBusy(async()=>{
    if(!state.po)throw new Error("Select a PO first.");
    const result=await post({action:"verify",po_number:state.po.po_number});
    state.wrote=true;await load(state.po.po_number);setMessage(result.message,result.data_matched?"ok":"error");
  }));
});
