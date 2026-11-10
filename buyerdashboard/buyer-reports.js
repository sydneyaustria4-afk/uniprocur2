"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const API = "../database/get-buyer-reports.php";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const palette = ["#f62225", "#ff6265", "#ff9698", "#d20808", "#b8b8b8", "#f4a041", "#a12a2a"];
  const thisYear = new Date().getFullYear();
  const state = {year:thisYear,quarter:0,data:null,loading:false,requestId:0};
  const peso = value => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
  const number = value => new Intl.NumberFormat("en-PH").format(Number(value)||0);
  const compact = value => {
    const n = Math.abs(Number(value)||0);
    if (n >= 1000000) return `${(n/1000000).toFixed(n%1000000 === 0 ? 0 : 1)}M`;
    if (n >= 1000) return `${(n/1000).toFixed(n%1000 === 0 ? 0 : 1)}K`;
    return number(n);
  };
  const el = (tag,text="",cls="") => {const n=document.createElement(tag);n.textContent=String(text);if(cls)n.className=cls;return n;};
  let toastTimeout;
  function toast(text) {const n=$("reportToast");n.textContent=String(text);n.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>n.hidden=true,3500);}
  function identity(buyer) {
    
const name = "Buyer";
const email = "buyer@gmail.com";
const initial = "B";

    for(const id of ["sideName","topName"])$(id).textContent=name;
    for(const id of ["sideEmail","topEmail"])$(id).textContent=email;
    for(const id of ["sideInitial","topInitial"])$(id).textContent=initial;
  }
  function niceCeiling(max) {
    if(max<=0)return 100;
    const raw=max/4,scale=10**Math.floor(Math.log10(raw));
    const rounded=[1,2,2.5,5,10].find(x=>x*scale>=raw)||10;
    return rounded*scale*4;
  }
  function chart(values,year,quarter) {
    const amounts=months.map((_,i)=>Math.max(0,Number(values[i])||0));
    const max=niceCeiling(Math.max(...amounts));
    const left=62,right=1053,top=20,bottom=251,width=right-left,height=bottom-top;
    const pts=amounts.map((v,i)=>({x:left+i*width/11,y:bottom-Math.min(1,v/max)*height}));
    function curve(list) {
      let d=`M${list[0].x.toFixed(2)},${list[0].y.toFixed(2)}`;
      for(let i=0;i<list.length-1;i++){
        const p0=list[Math.max(i-1,0)],p1=list[i],p2=list[i+1],p3=list[Math.min(i+2,list.length-1)];
        const x1=p1.x+(p2.x-p0.x)/6,y1=p1.y+(p2.y-p0.y)/6;
        const x2=p2.x-(p3.x-p1.x)/6,y2=p2.y-(p3.y-p1.y)/6;
        d+=` C${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
      }
      return d;
    }
    const line=curve(pts);
    const fill=`${line} L${right},${bottom} L${left},${bottom} Z`;
    const grid=[0,1,2,3,4].map(i=>{
      const y=bottom-i*height/4;
      return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#dedede" stroke-dasharray="4 5"/><text x="${left-11}" y="${y+4}" fill="#777" font-size="12" text-anchor="end">${compact(max*i/4)}</text>`;
    }).join("");
    const labels=months.map((m,i)=>{
      const x=pts[i].x;
      const inPeriod=quarter===0||Math.floor(i/3)+1===quarter;
      return `<text x="${x.toFixed(2)}" y="278" text-anchor="middle" fill="${inPeriod?'#555':'#aaa'}" font-size="12">${m}</text>`;
    }).join("");
    const dots=pts.map((p,i)=>amounts[i]>0?`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#e10b11"><title>${months[i]} ${year}: ${peso(amounts[i])}</title></circle>`:"").join("");
    const svg=`<svg viewBox="0 0 1080 295" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="buyerReportArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb0013" stop-opacity=".86"/><stop offset="1" stop-color="#fb0013" stop-opacity=".08"/></linearGradient></defs>${grid}<path d="${fill}" fill="url(#buyerReportArea)"/><path d="${line}" stroke="#fc1c27" stroke-width="2.8" fill="none"/>${dots}${labels}</svg>`;
    $("activityChart").innerHTML=svg; // numbers + fixed month labels only; no API text is injected
    $("activityChart").setAttribute("aria-label",`Approved PO value by month for ${year}: ${amounts.map((v,i)=>`${months[i]} ${peso(v)}`).join(', ')}`);
  }
  function categories(items) {
    const categories=(Array.isArray(items)?items:[]).filter(x=>Number(x.amount)>0);
    const pie=$("categoryPie"),legend=$("categoryLegend");legend.replaceChildren();
    if(!categories.length){pie.style.background="#e6e6e6";pie.setAttribute("aria-label","No approved Purchase Order categories yet.");legend.append(el("p","No categorized PO values for this period.","br-empty"));return;}
    const first=categories.slice(0,6).map(x=>({name:String(x.name||"Uncategorized"),amount:Number(x.amount)||0}));
    if(categories.length>6)first.push({name:"Other",amount:categories.slice(6).reduce((n,x)=>n+(Number(x.amount)||0),0)});
    const total=first.reduce((n,x)=>n+x.amount,0);
    let start=0;
    const pieces=first.map((x,i)=>{
      const end=start+x.amount/total*100;
      const s=`${palette[i%palette.length]} ${start.toFixed(4)}% ${end.toFixed(4)}%`;
      start=end;return s;
    });
    pie.style.background=`conic-gradient(${pieces.join(", ")})`;
    pie.setAttribute("aria-label",first.map(x=>`${x.name}: ${Math.round(x.amount/total*100)}%`).join(', '));
    first.forEach((x,i)=>{
      const row=el("div","","br-legend-row");
      const dot=el("span","","br-legend-dot");dot.style.background=palette[i%palette.length];
      const name=el("span",x.name);name.title=x.name;
      row.append(dot,name,el("strong",`${Math.round(x.amount/total*100)}%`));legend.append(row);
    });
  }
  function suppliers(items) {
    const root=$("supplierList");root.replaceChildren();
    const rows=(Array.isArray(items)?items:[]).filter(x=>Number(x.amount)>0).slice(0,5);
    if(!rows.length){root.append(el("p","No approved Purchase Orders from suppliers in this period.","br-empty"));return;}
    for(const item of rows){
      const row=el("div","","br-supplier-item");
      const name=el("span",item.supplier_name||"Unnamed supplier");name.title=item.supplier_name||"";
      row.append(name,el("strong",peso(item.amount)));root.append(row);
    }
  }
  function transactions(items){
    const body=$("recentRows");body.replaceChildren();
    const rows=Array.isArray(items)?items:[];
    if(!rows.length){const tr=el("tr");const td=el("td","No approved Purchase Orders found for the selected period.","br-empty-cell");td.colSpan=5;tr.append(td);body.append(tr);return;}
    for(const x of rows){
      const tr=el("tr");
      let date="—";
      if(/^\d{4}-\d{2}-\d{2}$/.test(String(x.order_date||""))){
        const d=new Date(`${x.order_date}T12:00:00`);
        if(!Number.isNaN(d.getTime()))date=d.toLocaleDateString("en-PH",{month:"short",day:"2-digit",year:"numeric"});
      }
      [date,x.po_number||"—",x.supplier_name||"—",x.item_summary||"—",peso(x.amount)].forEach(v=>tr.append(el("td",v)));
      body.append(tr);
    }
  }
  function render(data){
    identity(data.buyer||{});
    const s=data.summary||{};
    $("totalSpend").textContent=peso(s.total_approved_value);
    $("avgSpend").textContent=peso(s.average_per_month);
    $("avgSpendNote").textContent=`Based on ${number(data.period?.months_in_average)} elapsed month(s)`;
    $("topSupplier").textContent=s.top_supplier?.supplier_name||"—";
    $("topSupplier").title=s.top_supplier?.supplier_name||"No approved PO supplier";
    $("topSupplierNote").textContent=s.top_supplier?`${peso(s.top_supplier.amount)} (${Number(s.top_supplier.share_percent||0).toFixed(1)}%)`:"No approved PO value yet";
    $("totalPos").textContent=number(s.total_pos_created);
    $("totalPosNote").textContent=`${number(s.pending_pos)} pending approval · includes drafts`;
    $("activityYear").textContent=`${state.year} · ${["Full year","Jan–Mar","Apr–Jun","Jul–Sep","Oct–Dec"][state.quarter]}`;
    $("reportBasis").textContent=data.basis||"Approved PO commitments only; not Finance-confirmed spending.";
    chart(data.monthly||[],state.year,state.quarter);
    categories(data.categories||[]);suppliers(data.suppliers||[]);transactions(data.transactions||[]);
    const options=Array.from(new Set([state.year,...(Array.isArray(data.available_years)?data.available_years:[]).map(Number)])).filter(y=>Number.isInteger(y)&&y>=2000&&y<=2100).sort((a,b)=>b-a);
    $("reportYear").replaceChildren();
    for(const year of options){const opt=el("option",String(year));opt.value=String(year);$("reportYear").append(opt);}
    $("reportYear").value=String(state.year);
    $("reportQuarter").value=String(state.quarter);
  }
  async function load(){
    const id=++state.requestId;
    state.loading=true;
    $("reportError").hidden=true;
    $("filterButton").disabled=true;
    $("reportYear").disabled=true;
    try{
      const query=new URLSearchParams({year:String(state.year),quarter:String(state.quarter)});
      const response=await fetch(`${API}?${query}`,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
      let data;
      try{data=await response.json();}catch{throw new Error(`Invalid API response (HTTP ${response.status}).`);}
      if(!response.ok||!data?.success)throw new Error(data?.message||`HTTP ${response.status}`);
      if(id!==state.requestId)return;
      state.data=data;render(data);
    }catch(error){
      if(id!==state.requestId)return;
      state.data=null;$("reportError").textContent=error.message||"Unable to load Buyer Reports.";$("reportError").hidden=false;
      $("totalSpend").textContent="—";$("avgSpend").textContent="—";$("topSupplier").textContent="—";$("totalPos").textContent="—";
      $("activityChart").replaceChildren(el("p","Report unavailable; check database and Buyer access.","br-empty"));
      $("categoryLegend").replaceChildren(el("p","Unavailable","br-empty"));$("supplierList").replaceChildren(el("p","Unavailable","br-empty"));transactions([]);
      toast("Buyer Reports failed to load. Check the error message above.");
    }finally{if(id===state.requestId){state.loading=false;$("filterButton").disabled=false;$("reportYear").disabled=false;}}
  }
  const menu=$("filterMenu"),button=$("filterButton");
  function showMenu(on){menu.hidden=!on;button.setAttribute("aria-expanded",String(on));}
  button.addEventListener("click",()=>showMenu(menu.hidden));
  document.addEventListener("click",e=>{if(e.target instanceof Element&&!e.target.closest(".br-filter-wrap"))showMenu(false);});
  $("applyFilter").addEventListener("click",()=>{state.quarter=Number($("reportQuarter").value)||0;showMenu(false);load();});
  $("resetFilter").addEventListener("click",()=>{state.quarter=0;$("reportQuarter").value="0";showMenu(false);load();});
  $("reportYear").addEventListener("change",()=>{state.year=Number($("reportYear").value)||thisYear;load();});
  $("notificationButton").addEventListener("click",()=>toast("Buyer notifications are not connected yet."));
  $("signOutButton").addEventListener("click",()=>toast("Sign-out is handled by HR Universal Login."));
  $("exportPdf").addEventListener("click",()=>{if(!state.data){toast("Load the report before exporting.");return;}window.print();});
  function csvCell(v){let s=String(v??"");if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`;}
  $("exportExcel").addEventListener("click",()=>{
    const d=state.data;if(!d){toast("Load the report before exporting.");return;}
    const s=d.summary||{};
    const rows=[
      ["UNIPROCUR BUYER REPORTS"],["Year",state.year],["Quarter",state.quarter||"Full year"],
      ["Basis", "Approved PO commitments; not Finance-confirmed spending or payments"],[],
      ["SUMMARY","VALUE"],
      ["Total Approved PO Value",s.total_approved_value],
      ["Average Approved PO Value per Month",s.average_per_month],
      ["Total POs Created",s.total_pos_created],
      ["Top Supplier",s.top_supplier?.supplier_name||"—"],[],
      ["MONTH","APPROVED PO VALUE (PHP)"],...months.map((m,i)=>[`${m} ${state.year}`,Number(d.monthly?.[i]||0)]),[],
      ["CATEGORIES","APPROVED PO ITEM VALUE (PHP)"],...(d.categories||[]).map(x=>[x.name,x.amount]),[],
      ["SUPPLIERS","APPROVED PO VALUE (PHP)","APPROVED ORDERS"],...(d.suppliers||[]).map(x=>[x.supplier_name,x.amount,x.total_orders]),[],
      ["HIGH-VALUE TRANSACTIONS","PO","SUPPLIER","ITEMS","VALUE (PHP)"],...(d.transactions||[]).map(x=>[x.order_date,x.po_number,x.supplier_name,x.item_summary,x.amount]),
    ];
    const csv="\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=el("a");a.href=url;a.download=`uniprocur-buyer-reports-${state.year}-q${state.quarter}.csv`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast("Buyer report exported as a CSV compatible with Excel.");
  });
  load();
});
