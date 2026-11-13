'use strict';
(() => {
  const onReady = async () => {
    const $ = id => document.getElementById(id);
    const number = new URLSearchParams(location.search).get('pr') || '';
    const api = '../database/buyer-rejected-pr-action.php';
    let csrf = '';
    let busy = false;
    let initial = null;
    let planned = null;
    let toastTimer;

    const images = {
      'full-grain leather':'../assets/Full%20Grain%20Leather.svg',
      'black leather':'../assets/black%20leather.svg',
      'nubuck leather':'../assets/Nubuck%20Leather.svg',
      'mesh fabric':'../assets/Mesh%20Fabric.svg',
      'canvas fabric':'../assets/Canvas%20Fabric.svg',
      'pu leather':'../assets/PU%20Leather.svg',
      'rubber sole':'../assets/catalog/vulcanized-rubber-outsoles.png',
      'eva foam':'../assets/Eva%20Foam%20Sheets.svg',
      'eva foam sheets':'../assets/Eva%20Foam%20Sheets.svg',
      'foam insole':'../assets/foam%20insole.svg',
      'metal eyelets':'../assets/Metal%20Eyelets.svg',
      'metal buckles':'../assets/Metal%20Buckles.svg',
      'shoelaces':'../assets/shoe%20laces.svg',
      'shoe boxes':'../assets/Shoes%20Box.svg',
      'tissue paper rolls':'../assets/Tissue%20Paper%20Rolls.svg',
      'packaging tape':'../assets/Packaging%20Tape.svg',
      'shoe adhesive':'../assets/shoe%20adhesive.svg',
      'suede leather':'../assets/Suede%20Leather.svg',
      'tpr outsoles':'../assets/catalog/tpr-outsoles.png',
      'vulcanized rubber outsoles':'../assets/Vulcanized%20Rubber%20Outsoles.svg',
      'rubber cement':'../assets/Rubber%20Cement.svg'
    };
    const today = () => {
      const pieces = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const fields = Object.fromEntries(pieces.map(x=>[x.type,x.value]));
      return `${fields.year}-${fields.month}-${fields.day}`;
    };
    function status(message, bad = false) { $('statusMessage').textContent=message; $('statusMessage').classList.toggle('is-error',bad); }
    function toast(message) { $('toast').textContent=message; $('toast').classList.add('is-visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('is-visible'),4000); }
    function setReady(value) { for(const id of ['saveChanges','resubmit']) $(id).disabled=!value; }
    function buildInput(kind, label, value, max = 200) {
      const input=document.createElement(kind);
      input.setAttribute('aria-label',label);
      input.value=String(value??'');
      if(kind==='input'){input.type='text';input.maxLength=max;}
      else input.maxLength=max;
      return input;
    }
    function makeItem(item = {}) {
      const wrap=document.createElement('article');wrap.className='rev-item';
      const src=images[String(item.item_name||item.name||'').trim().toLowerCase()];
      if(src){
        const img=document.createElement('img');img.className='rev-item-image';img.src=src;img.alt=String(item.item_name||item.name||'Material');
        img.onerror=()=>{const x=document.createElement('div');x.className='rev-image-fallback';x.innerHTML='<img src="../assets/Group%2033.svg" alt="" aria-hidden="true"><small>Image unavailable</small>';img.replaceWith(x);};
        wrap.append(img);
      }else{const x=document.createElement('div');x.className='rev-image-fallback';x.innerHTML='<img src="../assets/Group%2033.svg" alt="" aria-hidden="true"><small>Image unavailable</small>';wrap.append(x);}
      const info=document.createElement('div');info.className='rev-item-info';
      const name=buildInput('input','Item name',item.item_name??item.name??'',200);name.className='rev-item-name';name.placeholder='Enter item name';name.required=true;name.dataset.field='name';
      const label=document.createElement('label');label.className='rev-item-label';label.textContent='Quantity:';
      const qtyLine=document.createElement('div');qtyLine.className='rev-qty-line';
      const qty=buildInput('input','Quantity',item.qty??item.quantity??'',20);qty.type='number';qty.min='0.01';qty.max='99999999.99';qty.step='any';qty.required=true;qty.dataset.field='quantity';
      const unit=buildInput('input','Unit',item.unit||'pairs',20);unit.className='rev-unit';unit.required=true;unit.dataset.field='unit';
      qtyLine.append(qty,unit);
      const desc=buildInput('textarea','Description',item.description??'',1500);desc.dataset.field='description';desc.placeholder='Description (optional)';desc.rows=3;
      const detail=document.createElement('details');detail.className='rev-extra-fields';detail.style.cssText='margin-top:8px;font-size:11px;color:#777';
      const summary=document.createElement('summary');summary.textContent='Item code / category';detail.append(summary);
      const code=buildInput('input','Item Code',item.item_code??item.code??'',30);code.dataset.field='code';code.placeholder='Item code';
      const category=buildInput('input','Category',item.category??'',100);category.dataset.field='category';category.placeholder='Category';
      code.style.cssText=category.style.cssText='width:100%;padding:6px;margin-top:4px;border:1px solid #ddd;border-radius:4px';detail.append(code,category);
      info.append(name,label,qtyLine,desc,detail);
      const remove=document.createElement('button');remove.className='rev-remove';remove.type='button';remove.title='Remove material';remove.setAttribute('aria-label','Remove material');
      const deleteIcon=document.createElement('img');deleteIcon.src='../assets/delete.svg';deleteIcon.alt='';deleteIcon.onerror=()=>{deleteIcon.replaceWith(document.createTextNode('✕'));};remove.append(deleteIcon);
      remove.addEventListener('click',()=>{wrap.remove();toast('Item removed. Save Draft to keep changes.');});
      wrap.append(info,remove);return wrap;
    }
    function addRow(item={}) {
      const add=$('addItemCard');
      $('itemRows').insertBefore(makeItem(item),add);
    }
    function collect() {
      const date=$('requiredDate').value;
      if(!date || date < today() || !/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Required Date cannot be in the past. Choose today or a future date.');
      const purpose=$('justification').value.trim();if(!purpose)throw Error('Justification is required.');
      const items=[...$('itemRows').querySelectorAll('.rev-item')].map(card=>{
        const v=key=>card.querySelector(`[data-field="${key}"]`).value.trim();
        return {name:v('name'),code:v('code'),category:v('category'),quantity:v('quantity'),unit:v('unit'),description:v('description')};
      });
      if(!items.length)throw Error('Add at least one material before saving.');
      if(items.length>100)throw Error('Maximum 100 items.');
      for(const [i,it] of items.entries())if(!it.name || !it.unit || !Number.isFinite(Number(it.quantity)) || Number(it.quantity)<=0 || Number(it.quantity)>99999999.99)throw Error(`Complete the name, unit and positive quantity for material ${i+1}.`);
      return {pr_number:number,csrf_token:csrf,needed_by:date,purpose,items};
    }
    function norm(it) {return {name:String(it.name??it.item_name??''),code:String(it.code??it.item_code??''),category:String(it.category??''),quantity:Number(it.quantity??it.qty??0),unit:String(it.unit??''),description:String(it.description??'')};}
    function addChange(label,detail) {
      const row=document.createElement('div');row.className='rev-change';const a=document.createElement('span');a.textContent=label;const b=document.createElement('span');b.textContent=detail;row.append(a,b);$('changesTable').append(row);
    }
    function prepareDialog() {
      try {planned=collect();} catch(error) {status(error.message,true);toast(error.message);return;}
      $('confirmPrNumber').textContent=number;
      $('confirmDescription').textContent=`Are you sure you want to resubmit ${number} for approval?`;
      $('confirmDate').textContent=planned.needed_by;
      $('confirmItems').textContent=planned.items.map(it=>it.name).join(', ');
      $('changesTable').replaceChildren();
      const oldItems=(initial?.items||[]).map(norm); const newItems=planned.items.map(norm);
      const max=Math.max(oldItems.length,newItems.length);
      let changes=0;
      for(let i=0;i<max;i++){
        const old=oldItems[i],fresh=newItems[i];
        if(!old&&fresh){addChange(fresh.name,`Added · ${fresh.quantity} ${fresh.unit}`);changes++;continue;}
        if(old&&!fresh){addChange(old.name,'Removed');changes++;continue;}
        const diffs=[];
        if(old.name!==fresh.name)diffs.push(`${old.name} → ${fresh.name}`);
        if(old.quantity!==fresh.quantity || old.unit!==fresh.unit)diffs.push(`${old.quantity} ${old.unit} → ${fresh.quantity} ${fresh.unit}`);
        if(old.description!==fresh.description)diffs.push('Description updated');
        if(old.code!==fresh.code || old.category!==fresh.category)diffs.push('Item details updated');
        if(diffs.length){addChange(fresh.name,diffs.join(' · '));changes++;}
      }
      if(initial && initial.needed_by!==planned.needed_by){addChange('Required date',`${initial.needed_by||'—'} → ${planned.needed_by}`);changes++;}
      if(initial && initial.purpose!==planned.purpose){addChange('Justification','Updated');changes++;}
      if(changes===0)addChange('Request details','No changes from the initial rejected version');
      $('confirmCheckbox').checked=false;$('submitConfirmed').disabled=true;
      $('confirmLayer').hidden=false;document.body.style.overflow='hidden';$('confirmCheckbox').focus();
    }
    function closeDialog(){if(busy)return;$('confirmLayer').hidden=true;document.body.style.overflow='';}
    async function send(action){
      if(busy)return;
      let data;
      try{data=action==='resubmit'&&planned?planned:collect();}catch(error){status(error.message,true);toast(error.message);return;}
      busy=true;setReady(false);$('submitConfirmed').disabled=true;
      status(action==='resubmit'?'Resubmitting to Manager…':'Saving corrected PR…');
      try{
        const response=await fetch(api,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({...data,action})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.success!==true)throw Error(result.message||`Unable to ${action} PR (HTTP ${response.status}).`);
        if(action==='resubmit'){
          $('confirmLayer').hidden=true;$('successNumber').textContent=number;$('successLayer').hidden=false;
          document.body.style.overflow='hidden';
        } else {
          toast('Draft corrections saved to MySQL.');status('Corrections saved. PR remains Rejected until you resubmit.');
          planned=null;
        }
      }catch(error){status(error.message,true);toast(error.message);if(action==='resubmit'){$('confirmLayer').hidden=true;document.body.style.overflow='';}}
      finally{busy=false;setReady(true);}
    }
    $('backLink').href='view-purchase-request.html?pr='+encodeURIComponent(number);
    $('prNumber').textContent=number||'Invalid PR';$('headerNumber').textContent=number||'Invalid PR';
    $('saveChanges').addEventListener('click',()=>send('save'));
    $('resubmit').addEventListener('click',prepareDialog);
    $('confirmCheckbox').addEventListener('change',()=>{$('submitConfirmed').disabled=!$('confirmCheckbox').checked;});
    $('submitConfirmed').addEventListener('click',()=>{if($('confirmCheckbox').checked)send('resubmit');});
    for(const id of ['closeDialog','cancelDialog']) $(id).addEventListener('click',closeDialog);
    $('confirmLayer').addEventListener('click',e=>{if(e.target===$('confirmLayer'))closeDialog();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('confirmLayer').hidden)closeDialog();});
    $('requiredDate').min=today();
    $('requiredDate').addEventListener('focus',()=>{$('requiredDate').min=today();});
    if(!/^PR-[A-Za-z0-9-]{3,70}$/.test(number)){status('Invalid Purchase Request number.',true);return;}
    try{
      const response=await fetch(api+'?pr_number='+encodeURIComponent(number),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const result=await response.json();if(!response.ok||result.success!==true)throw Error(result.message||'Cannot load PR.');
      const pr=result.purchase_request;
      if(String(pr.status).toLowerCase()!=='rejected')throw Error('This PR is not rejected. Return to the Purchase Request page.');
      csrf=String(result.csrf_token||'');if(!csrf)throw Error('Buyer session validation unavailable.');
      $('topReason').textContent=pr.rejection_reason||pr.manager_remarks||'No rejection reason was entered by the Manager.';
      $('buyerName').textContent=result.buyer?.full_name||'Buyer';$('buyerEmail').textContent=result.buyer?.email||'buyer@gmail.com';
      $('buyerInitial').textContent=($('buyerName').textContent.trim()[0]||'B').toUpperCase();
      $('justification').value=pr.purpose||'';
      $('requiredDate').value=pr.needed_by>=today()?pr.needed_by:'';
      initial=result.baseline||{needed_by:pr.needed_by,purpose:pr.purpose,items:result.items||[]};
      $('itemRows').replaceChildren();
      const add=document.createElement('button');add.type='button';add.className='rev-add';add.id='addItemCard';add.innerHTML='<span aria-hidden="true">＋</span> Add Item';// UNIPROCUR_REVISE_ITEM_PICKER_20261113
      add.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('uniprocur:open-item-picker')));
      document.addEventListener('uniprocur:catalog-item-selected', event => {
        const selected = event.detail;
        if (!selected || !selected.code || !selected.name || !selected.unit || !selected.category) return;
        addRow({ item_name: selected.name, item_code: selected.code, category: selected.category, unit: selected.unit, qty: '' });
        toast(selected.name + ' added to PR. Enter quantity, then Save Draft or Resubmit.');
      });
      $('itemRows').append(add);
      (result.items||[]).forEach(addRow);
      status(pr.needed_by < today()?'Previous required date has passed. Select a new future date before saving.':'Review the rejected Purchase Request and revise the details before resubmitting.');
      setReady(true);
    }catch(error){status(error.message||'Unable to load PR details.',true);}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});else void onReady();
})();
