"use strict";
(() => {
 const query = new URLSearchParams(location.search);
 const number = query.get('rfq_number');
 const $ = id => document.getElementById(id);
 const currency = n => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(n)||0);
 const assets = {
  'canvas fabric':'canvas-fabric.png','pu leather':'pu-leather.png','nubuck leather':'nubuck-leather.png',
  'full-grain leather':'full-grain-leather.png','mesh fabric':'mesh-fabric.png','suede leather':'suede-leather.png',
  'metal buckles': 'metal-buckles.png',

 };
 
const assetFor = name => {
    const key = String(name || "").trim().toLowerCase();

    const newImages = {
        "black leather": "../assets/black%20leather.svg",
        "foam insole": "../assets/foam%20insole.svg",
        "shoelaces": "../assets/shoe%20laces.svg",
        "rubber sole": "../assets/catalog/vulcanized-rubber-outsoles.png",
        "shoes adhesive": "../assets/catalog/rubber-cement.png",
        "shoe boxes": "../assets/catalog/shoe-boxes.png",
        "shoe boxes (eco friendly)": "../assets/catalog/shoe-boxes.png"
    };

    if (newImages[key]) {
        return newImages[key];
    }

    return `../assets/catalog/${assets[key] || "canvas-fabric.png"}`;
};

 const bgFor = name => {let k=(name||'').toLowerCase(); return k.includes('synthhide')?'synthide.svg':k.includes('cordillera')?'cordillera.svg':k.includes('marikina')?'marikina.svg':k.includes('soletech')?'soletech.svg':k.includes('metalcraft')?'metalcraft.svg':'ecobox.svg'};
 const make=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};

 function buildOffer(s){
  const offer=make('article','offer');offer.dataset.quoteId=s.quote_id;
  const info=make('div','offer-info');info.append(make('h2','',s.name));
  const fields=[['Lead Time:',s.lead_time_days?`${s.lead_time_days} days`:'—'],['Payment Terms:',s.payment_terms||'—'],['Ratings:',s.rating?`★ ${s.rating}`:'—'],['Total:',s.total_amount===null?'Incomplete':currency(s.total_amount)]];
  fields.forEach(([a,b])=>{const r=make('div','detail');r.append(make('span','',a),make('b','',b));info.append(r)});
  const btn=make('button','supplier-select','Select');btn.type='button';
  btn.disabled=s.total_amount===null || !(s.items||[]).length;
  btn.title=btn.disabled?'This quotation must be saved before selection':'Review this supplier for award';
  btn.addEventListener('click',()=>{
   window.location.href=`award-confirmation.html?rfq_number=${encodeURIComponent(number)}&quote_id=${encodeURIComponent(s.quote_id)}`;
  });info.append(btn);
  const products=make('div','product-list');(s.items||[]).forEach(item=>{
   const tile=make('div','product');const img=make('img');img.src=assetFor(item.item_name);img.alt=item.item_name;
   tile.append(img,make('span','tag',item.item_name),make('span','price',`${currency(item.unit_price)} / ${item.unit}`));products.append(tile);
  });offer.append(info,products);return offer;
 }
 function buildSummary(suppliers){
  const complete=suppliers.filter(s=>s.total_amount!==null);
  if(!complete.length)return;
  const lowest=[...complete].sort((a,b)=>Number(a.total_amount)-Number(b.total_amount))[0];
  const fastest=[...complete].sort((a,b)=>Number(a.lead_time_days||999)-Number(b.lead_time_days||999))[0];
  const bestTerms=[...complete].sort((a,b)=>Number((b.payment_terms||'').replace(/\D/g,''))-Number((a.payment_terms||'').replace(/\D/g,'')))[0];
  const bestRating=[...complete].sort((a,b)=>Number(b.rating||0)-Number(a.rating||0))[0];
  const cards=[['Lowest Price',lowest],['Fastest Delivery',fastest],['Best Terms',bestTerms],['Highest Rating',bestRating]];
  const wrap=$('summaryCards');wrap.replaceChildren();cards.forEach(([title,s])=>{
   const card=make('div','summary-card');card.style.backgroundImage=`url("../assets/${bgFor(s.name)}")`;card.append(make('small','',title),make('strong','',s.name));wrap.append(card);
  });
 }
 async function init(){
  if(!number){$('status').textContent='RFQ number missing.';return;}
  try{
   const response=await fetch(`../database/get-rfq-comparison.php?rfq_number=${encodeURIComponent(number)}`,{credentials:'same-origin',headers:{Accept:'application/json'}});
   const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Unable to load RFQ comparison.');
   $('headerNumber').textContent=data.rfq.rfq_number;$('rfqNumber').textContent=data.rfq.rfq_number;
   const first=data.suppliers[0];$('rfqItems').textContent=first?.items?.map(x=>x.item_name).join(' + ')||data.rfq.pr_number;
   $('createdDate').textContent=data.rfq.created_at?new Date(data.rfq.created_at.replace(' ','T')).toLocaleDateString('en-PH',{month:'long',day:'2-digit',year:'numeric'}):'—';
   const list=$('supplierOffers');list.replaceChildren();data.suppliers.forEach(s=>list.append(buildOffer(s)));buildSummary(data.suppliers);
   $('status').textContent=data.suppliers.every(s=>s.total_amount!==null)?'':'Some supplier quotations are not yet saved.';
  }catch(e){console.error(e);$('status').textContent=e.message;}
 }
 init();
})();
