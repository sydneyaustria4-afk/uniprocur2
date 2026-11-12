"use strict";
// Refresh the existing Monthly Purchase Activity chart from MySQL every 30 seconds.
// Read-only; does not auto-create approved invoices or pretend an approval occurred.
(() => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const load = async () => {
    if (document.hidden || typeof window.renderMonthlyPurchaseActivity !== 'function') return;
    try {
      const r = await fetch('../database/get-buyer-monthly-activity.php', {
        credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}
      });
      const d = await r.json();
      if (!r.ok || !d.success || !Array.isArray(d.monthly) || d.monthly.length!==12) return;
      const chartData=d.monthly.map((value,i)=>({month:months[i],value:Number(value)||0}));
      const empty=document.querySelector('.chart-empty-state');
      if(chartData.some(v=>v.value>0)) {
        window.renderMonthlyPurchaseActivity(chartData);
      } else {
        if(empty)empty.textContent='No successful purchases with approved or posted invoices yet.';
        window.renderMonthlyPurchaseActivity([]);
      }
    } catch(e) { console.warn('Purchase activity refresh:',e); }
  };
  document.addEventListener('DOMContentLoaded',()=>{
    window.setInterval(load,30_000);
  });
})();
