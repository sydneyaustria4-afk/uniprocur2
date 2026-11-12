(function(){
'use strict';
const form=document.getElementById('searchForm');
const input=document.getElementById('po');
const msg=document.getElementById('status');
const result=document.getElementById('results');
const text=(el,s)=>{el.textContent=s===null||s===undefined?'':String(s)};
const td=(row,value)=>{const cell=document.createElement('td');text(cell,value);row.append(cell)};
const number=x=>Number(x??0).toFixed(2);
async function load(){
 result.hidden=true;
 const po=input.value.trim();
 if(!/^PO-[a-zA-Z0-9-]{1,30}$/.test(po)){text(msg,'Enter a valid PO number.');return;}
 text(msg,'Checking real Inventory Goods Receipts…');
 try{
  const response=await fetch('../database/get-buyer-real-goods-receipts.php?po_number='+encodeURIComponent(po),{cache:'no-store',credentials:'same-origin'});
  const data=await response.json();
  if(!response.ok||!data.success)throw new Error(data.message||'Could not load data.');
  text(document.getElementById('poTitle'),data.po.po_number+' — '+data.po.po_status.toUpperCase());
  text(document.getElementById('poDetails'),`${data.po.pr_number} · ${data.po.inventory_request_number||'No Inventory request link'} · ${data.po.supplier_name}`);
  const items=document.getElementById('itemRows');items.replaceChildren();
  for(const item of data.items){const tr=document.createElement('tr');
   td(tr,item.item_name+' / '+(item.inventory_item_code||'NOT MAPPED'));td(tr,number(item.qty_ordered));
   td(tr,number(item.qty_received));td(tr,number(item.real_accepted));td(tr,number(item.real_rejected));td(tr,number(item.remaining));
   td(tr,item.matches_real_receipts?'Yes':'No — investigate');items.append(tr);}
  const receipts=document.getElementById('receiptRows');receipts.replaceChildren();
  if(!data.receipts.length){const r=document.createElement('tr');const c=document.createElement('td');c.colSpan=6;text(c,'No REAL receipt posted. Earlier GR-TEST records do not appear here.');r.append(c);receipts.append(r);}
  for(const rec of data.receipts){const tr=document.createElement('tr');[rec.goods_receipt_number,rec.warehouse_name,rec.delivered,rec.accepted,rec.rejected,rec.received_date].forEach(v=>td(tr,v));receipts.append(tr);}
  const verified=document.getElementById('verificationResult');
  text(verified,data.fully_received_from_real_gr?'PO fully received from REAL Inventory GR — invoice still needs separate verification.':'Not fully received from REAL Inventory GR. Do not post invoice to Finance.');
  verified.className=data.fully_received_from_real_gr?'good':'bad';
  text(msg,'Read-only verification loaded.');result.hidden=false;
 }catch(e){text(msg,e.message||'Request failed.');}
}
const params=new URLSearchParams(location.search);input.value=params.get('po_number')||'PO-2026-0004';
form.addEventListener('submit',ev=>{ev.preventDefault();load();});load();
})();
