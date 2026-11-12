/* Read-only enhancement of existing Figma View Invoice page with real GR & match.
 * Does not replace the original page, modify PO/stock, or enable Finance posting. */
"use strict";
document.addEventListener("DOMContentLoaded", async () => {
  const params=new URLSearchParams(location.search);
  if(params.get("demo")==="1")return; // Original Figma demo must stay a clearly labeled demo.
  const invoiceNumber=params.get("invoice_number")||"";
  if(!invoiceNumber)return;
  const $=id=>document.getElementById(id);
  const money=x=>x===null||x===undefined||x===""?"—":"Php. "+new Intl.NumberFormat("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x));
  const qty=(value,unit)=>value===null||value===undefined?"—":new Intl.NumberFormat("en-PH",{maximumFractionDigits:2}).format(Number(value))+(unit?" "+unit:"");
  const set=(id,text)=>{const e=$(id);if(e)e.textContent=String(text);};
  async function get(url) {
    const r=await fetch(url,{cache:"no-store",credentials:"same-origin",headers:{Accept:"application/json"}});
    const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||"Unable to load receipt verification");return d;
  }
  try {
    const details=await get("../database/get-buyer-invoice-details.php?invoice_number="+encodeURIComponent(invoiceNumber));
    if(!details.invoice?.po_number)return;
    const data=await get("../database/buyer-invoice-integration-local.php?po_number="+encodeURIComponent(details.invoice.po_number));
    if(!data.invoice||String(data.invoice.invoice_number)!==invoiceNumber||!data.match)return;
    const sheet=$("invoiceSheet");
    if(sheet&&sheet.hidden){await new Promise(resolve=>{
      const observer=new MutationObserver(()=>{if(!sheet.hidden){observer.disconnect();resolve();}});
      observer.observe(sheet,{attributes:true,attributeFilter:["hidden"]});
      setTimeout(()=>{observer.disconnect();resolve();},3000);
    });}
    if(sheet?.hidden)return; // Original details page failed; do not cover up its error.
    const inv=data.invoice, match=data.match, lines=data.invoice_items||[], poItems=data.po_items||[];
    const grs=match.real_receipts||[];
    const grNumbers=grs.map(x=>x.goods_receipt_number).filter(Boolean);
    set("supplierInvoiceNumber", inv.supplier_invoice_reference||"—");
    set("grReference",grNumbers.length?grNumbers.join(" · "):"No real Goods Receipt");
    $("grReference").style.overflowWrap="anywhere";
    const byPo=new Map(poItems.map(x=>[Number(x.po_item_id),x]));
    const byInvoice=new Map(lines.map(x=>[Number(x.po_item_id),x]));
    const realByPo=new Map(match.items.map(x=>[Number(x.po_item_id),x]));
    const body=$("itemRows");body.replaceChildren();
    let subtotal=0;
    poItems.forEach((line,index)=>{
      const id=Number(line.po_item_id), saved=byInvoice.get(id), verified=realByPo.get(id), tr=document.createElement("tr");
      const unit=line.unit||"";
      const cols=[index+1,line.item_name,qty(line.qty_ordered,unit),qty(verified?.real_gr_accepted??0,unit),saved?qty(saved.qty_billed,unit):"—",money(saved?.unit_price??line.unit_price),saved?money(saved.subtotal):"—"];
      for(const value of cols){const td=document.createElement("td");td.textContent=String(value);tr.append(td);}
      body.append(tr);
      subtotal+=Number(saved?.subtotal||0);
    });
    set("subtotal",money(subtotal));
    set("vat","—"); // Existing invoice schema & this integration do not represent VAT separately.
    set("totalAmount",money(inv.total_amount));
    const hasDocument=match.supplier_document_verified===true;
    const dataMatched=match.data_matched===true;
    const verified=inv.match_status==="matched"&&hasDocument&&dataMatched&&inv.status==="ready_to_post";
    const demo=inv.source_kind==="demo";
    let summary="3-Way Match: Discrepancy — review invoice quantities, prices, and receipts";
    if(verified)summary="✓ 3-Way Match: Verified — Ready to Post (Finance not connected)";
    else if(demo&&dataMatched)summary="3-Way Match: Data matches — DEMO only; not Ready to Post";
    else if(dataMatched)summary="3-Way Match: Data matches; verification/approval still required";
    set("matchResult",summary);
    $("matchResult").classList.toggle("sample",verified);
    set("sourceHint",`${grNumbers.length} real Inventory Goods Receipt(s) checked. Invoice source: ${demo?"classroom DEMO":"supplier-document declaration"}. ${verified?"PO, real GR and recorded invoice passed local 3-way checks.":"Do not send to Finance until genuine supplier documents and approvals are verified."} VAT is not calculated by this local integration.`);
    set("dataBanner",verified?"Real Goods Receipts and recorded invoice were checked locally. Ready to Post is a Procurement status only; Finance posting is not connected.":"This saved invoice uses real local Goods Receipt quantities. Invoice verification is separate from receiving and Finance posting remains disabled.");
    // The existing main script already disables these buttons. Keep them disabled.
    $("postButton").disabled=true;
    $("discrepancyButton").disabled=true;
  }catch(error){
    // Preserve existing invoice view on errors; never fabricate matching data.
    const hint=$("sourceHint");
    if(hint&&!$("invoiceSheet")?.hidden)hint.textContent="Real GR verification was unavailable: "+(error.message||"connection error")+". No match has been confirmed.";
  }
});
