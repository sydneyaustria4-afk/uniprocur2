'use strict';
(() => {
  const params=new URLSearchParams(location.search);
  const rfqNumber=params.get('rfq_number');
  const selectedId=Number(params.get('quote_id'));
  const byId=id=>document.getElementById(id);
  const currency=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);
  const fileMap={'canvas fabric':'canvas-fabric.png','pu leather':'pu-leather.png','nubuck leather':'nubuck-leather.png','full-grain leather':'full-grain-leather.png','mesh fabric':'mesh-fabric.png','suede leather':'suede-leather.png'};
  const supplierImage=name=>{const n=(name||'').toLowerCase();return n.includes('synthhide')?'synthide.svg':n.includes('cordillera')?'cordillera.svg':n.includes('marikina')?'marikina.svg':n.includes('soletech')?'soletech.svg':n.includes('metalcraft')?'metalcraft.svg':'ecobox.svg';};
  const locationMap={synthhide:'Cavite Economic Zone, Cavite',marikina:'Marikina City, Metro Manila',cordillera:'Baguio City, Benguet',soletech:'Valenzuela City, Metro Manila',metalcraft:'Caloocan City, Metro Manila',ecobox:'Laguna Technopark, Laguna'};
  const supplierLocation=name=>{const n=(name||'').toLowerCase().replace(/\s+/g,'');return Object.keys(locationMap).find(k=>n.includes(k))?locationMap[Object.keys(locationMap).find(k=>n.includes(k))]:'Location not available';};
  const mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e;};
  const set=(id,value)=>byId(id).textContent=value;
  const comparisonUrl=`comparison-matrix.html?rfq_number=${encodeURIComponent(rfqNumber||'')}`;
  byId('backLink').href=comparisonUrl;byId('cancelLink').href=comparisonUrl;
  const status=byId('status');
  if(!rfqNumber||!Number.isInteger(selectedId)||selectedId<=0){status.textContent='RFQ number or selected supplier is missing.';status.classList.add('error');return;}
  let selected=null;
  function productCard(item){const card=mk('article','product');const image=mk('div','product-image');const img=mk('img');img.src='../assets/catalog/'+(fileMap[String(item.item_name).toLowerCase()]||'canvas-fabric.png');img.alt=item.item_name;image.append(img,mk('span','item-tag',item.item_name));const content=mk('div','product-detail');[['Qty:',`${Number(item.qty)} ${item.unit}`],['Unit Price:',`${currency(item.unit_price)} / ${item.unit}`],['Total:',currency(item.subtotal)]].forEach(([a,b])=>{const row=mk('div','item-field');row.append(mk('strong','',a),mk('span','',b));content.append(row)});card.append(image,content);return card;}
  async function load(){try{
    const response=await fetch(`../database/get-rfq-comparison.php?rfq_number=${encodeURIComponent(rfqNumber)}`,{credentials:'same-origin',headers:{Accept:'application/json'}});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Unable to retrieve comparison.');
    selected=(data.suppliers||[]).find(s=>Number(s.quote_id)===selectedId);
    if(!selected)throw new Error('The selected supplier is not part of this RFQ.');
    if(selected.total_amount===null||!(selected.items||[]).length)throw new Error('This supplier quotation has not been saved yet.');
    set('headerNumber',data.rfq.rfq_number);set('supplierName',selected.name);set('supplierLocation',supplierLocation(selected.name));set('supplierRating',selected.rating?'★ '+selected.rating:'Not rated');set('summarySupplier',selected.name);set('summaryLocation',supplierLocation(selected.name));set('summaryContact','Supplier');set('totalValue',currency(selected.total_amount));set('leadValue',selected.lead_time_days?`${selected.lead_time_days} days`:'—');set('paymentValue',selected.payment_terms||'—');
    byId('supplierBanner').style.backgroundImage=`url('../assets/${supplierImage(selected.name)}')`;
    byId('products').replaceChildren(...selected.items.map(productCard));
    status.textContent='';
    if(data.rfq.status==='awarded'){status.textContent='This RFQ has already been awarded. Awarding again is disabled.';return;}
    if(data.rfq.status!=='compared'){status.textContent='Save and Compare the quotations before awarding.';return;}
    byId('awardButton').disabled=false;
  }catch(error){status.textContent=error.message;status.classList.add('error');console.error(error)}}
  byId('awardButton').addEventListener('click',async()=>{
    if(!selected)return;
    if(!confirm(`Award ${rfqNumber} to ${selected.name} for ${currency(selected.total_amount)}? This will record the winning supplier.`))return;
    const btn=byId('awardButton');btn.disabled=true;btn.textContent='Awarding...';
    try{const response=await fetch('../database/award-rfq.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({rfq_number:rfqNumber,quote_id:selectedId})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Unable to award supplier.');status.classList.remove('error');status.classList.add('success');status.textContent=`${selected.name} has been awarded ${rfqNumber}. Supplier response is simulated; no external message has been sent.`;btn.textContent='Awarded ✓';byId('nextContent').innerHTML='<p><strong>RFQ Awarded Successfully!</strong></p><p>The winning quotation is saved in MySQL. The next implementation stage is Purchase Order creation and Manager approval.</p><p class="note">No Purchase Order has been created automatically.</p>';
    }catch(error){status.classList.add('error');status.textContent=error.message;btn.disabled=false;btn.textContent='◉ Award RFQ';console.error(error)}
  });load();
})();
