"use strict";
// Keep existing Enter Quotation UI unchanged: enable Save and Compare when MySQL data loads.
(() => {
 const button=document.getElementById('compareButton');
 const number=new URLSearchParams(location.search).get('rfq_number');
 if(!button||!number)return;
 async function check(){
  try{
   const r=await fetch(`../database/get-rfq-quotation-data.php?rfq_number=${encodeURIComponent(number)}`,{credentials:'same-origin'});
   const d=await r.json();
   if(r.ok&&d.success&&d.suppliers?.length){button.disabled=false;button.removeAttribute('title');}
  }catch(e){console.error('RFQ validation:',e)}
 }
 check();
 button.addEventListener('click',async()=>{
  if(button.disabled)return;
  if(!window.confirm('Save the simulated supplier quotations to MySQL and open the Comparison Matrix?'))return;
  button.disabled=true;const label=button.innerHTML;button.textContent='Saving...';
  try{
   const r=await fetch('../database/save-rfq-quotations.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({rfq_number:number})});
   const d=await r.json();if(!r.ok||!d.success){
    let details=d.missing?.slice(0,8).join('\n')||'';throw new Error((d.message||'Unable to save quotations.')+(details?'\n\nMissing:\n'+details:''));
   }
   location.href=`comparison-matrix.html?rfq_number=${encodeURIComponent(number)}`;
  }catch(e){console.error(e);alert(e.message);button.disabled=false;button.innerHTML=label;}
 });
})();
