"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PHP = "../database/get-manager-reports.php";
  const php = v => new Intl.NumberFormat("en-PH", {style:"currency", currency:"PHP", minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(v)||0);
  const compact = v => new Intl.NumberFormat("en-PH", {notation:"compact", maximumFractionDigits:1}).format(Number(v)||0);
  const number = v => new Intl.NumberFormat("en-PH").format(Number(v)||0);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  };
  const currentYear = new Date().getFullYear();
  const state = {year: currentYear, quarter: 0, data: null, loading: false};
  let toastTimer;
  let pendingRequest = 0;

  function toast(message) {
    const t = $("reportToast");
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {t.hidden = true;}, 3400);
  }
  function identity(manager) {
    const full = String(manager?.full_name || "Manager");
    const first = full.trim().split(/\s+/)[0] || "Manager";
    const initial = first.charAt(0).toUpperCase() || "M";
    const email = String(manager?.email || "—");
   
$("welcomeText").textContent = "Welcome Manager!";

    for (const id of ["sidebarManagerName", "topbarManagerName"]) $(id).textContent = full;
    for (const id of ["sidebarManagerEmail", "topbarManagerEmail"]) $(id).textContent = email;
    for (const id of ["sidebarAvatar", "topbarAvatar"]) $(id).textContent = initial;
  }
  function niceCeiling(max) {
    if (!Number.isFinite(max) || max <= 0) return 100000;
    const stepRaw = max / 4;
    const unit = 10 ** Math.floor(Math.log10(stepRaw));
    const step = [1, 2, 2.5, 5, 10].find(x => x * unit >= stepRaw) || 10;
    return step * unit * 4;
  }
  function renderBars(values, year, quarter) {
    const amount = months.map((_,i) => Math.max(0, Number(values[i])||0));
    const ceiling = niceCeiling(Math.max(...amount));
    const axis = $("barAxis");
    axis.replaceChildren();
    for (let j=4; j>=0; j--) axis.append(make("span", "", compact(ceiling*j/4)));
    const grid = $("barGrid");
    grid.replaceChildren();
    months.forEach((month, i) => {
      const selected = quarter===0 || Math.floor(i/3)+1===quarter;
      const group = make("div", "month-group"+(selected ? "" : " out-of-period"));
      const area = make("div", "bar-area");
      const bar = make("div", "month-bar");
      bar.style.height = `${Math.max(0,Math.min(100,(amount[i]/ceiling)*100))}%`;
      bar.setAttribute("title", `${month} ${year}: ${php(amount[i])} in approved PO commitments`);
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${month} ${year}: ${php(amount[i])}`);
      area.append(bar);
      group.append(area, make("span", "", month));
      grid.append(group);
    });
    $("monthlyYear").textContent = String(year);
    const nonzero = amount.some(v => v > 0);
    $("spendBasis").textContent = nonzero
      ? "Monthly values are approved PO commitments, not verified Finance-posted spending. Months outside the selected quarter are zeroed."
      : "No approved Purchase Orders for this period. The chart uses actual zero values, not Figma sample numbers.";
  }
  function renderSuppliers(suppliers) {
    const body = $("supplierRows");
    body.replaceChildren();
    if (!suppliers.length) {
      const row = make("tr"), cell = make("td", "", "No suppliers registered.");
      cell.colSpan=6; row.append(cell);body.append(row);return;
    }
    suppliers.forEach(s => {
      const row = make("tr");
      row.append(make("td", "", s.supplier_name || "—"));
      row.append(make("td", "", number(s.total_orders)));
      row.append(make("td", "", s.on_time_percent == null ? "—" : `${Number(s.on_time_percent).toFixed(1)}%`));
      row.append(make("td", "", s.rating == null ? "—" : `★ ${Number(s.rating).toFixed(1)}`));
      const statusCell = make("td");
      statusCell.append(make("span", "supplier-status", s.performance_status || "Not measured"));
      row.append(statusCell);
      row.append(make("td", "", php(s.commitment_amount)));
      body.append(row);
    });
  }
  const statusColors = {pending:"#dd5109", approved:"#05634d", rejected:"#b90b07"};
  function renderPie(pieId, legendId, entries, emptyText) {
    const pie = $(pieId);
    const legend = $(legendId);
    legend.replaceChildren();
    const valid = entries.map(x=>({...x, value:Math.max(0,Number(x.value)||0)}));
    const total = valid.reduce((s,x)=>s+x.value,0);
    if (!total) {
      pie.style.background = "#e8e9ec";
      pie.setAttribute("aria-label", emptyText);
      legend.append(make("p", "no-chart-message", emptyText));
      return;
    }
    let cursor = 0;
    const pieces = valid.filter(x => x.value > 0).map(x => {
      const next = cursor+x.value/total*100;
      const part=`${x.color} ${cursor.toFixed(3)}% ${next.toFixed(3)}%`;
      cursor = next;
      return part;
    });
    pie.style.background = `conic-gradient(${pieces.join(", ")})`;
    pie.setAttribute("aria-label", valid.map(x=>`${x.name}: ${(x.value/total*100).toFixed(1)}%`).join(", "));
    valid.forEach(x => {
      const line = make("div", "legend-line");
      const dot=make("span","legend-dot"); dot.style.background=x.color;
      const label=make("span","legend-name", x.name);
      const value=make("span","legend-value",`${Math.round(x.value/total*100)}%`);
      value.title=`${number(x.value)} of ${number(total)}`;
      line.append(dot,label,value);legend.append(line);
    });
  }
  function renderStatuses(id, legend, values, empty) {
    const status = values || {};
    const entries = [
      {name:"Pending", value:status.pending, color:statusColors.pending},
      {name:"Approved", value:status.approved, color:statusColors.approved},
      {name:"Rejected", value:status.rejected, color:statusColors.rejected},
    ];
    renderPie(id,legend,entries,empty);
  }
  function renderCategories(categories) {
    const colors = ["#df530a", "#05654b", "#b80908", "#efae4f", "#646fb3"];
    const present = (Array.isArray(categories) ? categories : []).filter(c=>Number(c.amount)>0);
    const head = present.slice(0,4).map((c,i)=>({name:c.name, value:Number(c.amount),color:colors[i]}));
    if (present.length>4) head.push({name:"Other categories",value:present.slice(4).reduce((n,c)=>n+Number(c.amount),0),color:colors[4]});
    renderPie("categoryPie","categoryLegend",head,"No categorized approved PO items for this period.");
  }
  function describePeriod(year, quarter) {
    const p=["Full year","Jan–Mar","Apr–Jun","Jul–Sep","Oct–Dec"][quarter];
    return `${year} · ${p}`;
  }
  function updateYears(years) {
    const select=$("yearFilter");
    select.replaceChildren();
    const opts = Array.from(new Set([state.year,...(Array.isArray(years)?years:[]).map(Number)])).filter(x=>Number.isInteger(x)&&x>1999&&x<2101).sort((a,b)=>b-a);
    opts.forEach(year=>{const option=make("option","",year);option.value=String(year);select.append(option);});
    select.value=String(state.year);
    $("quarterFilter").value=String(state.quarter);
  }
  function render(data) {
    identity(data.manager);
    const s=data.summary||{};
    $("totalSpend").textContent=php(s.total_commitment);
    $("avgSpend").textContent=php(s.average_per_month);
    $("supplierCount").textContent=number(s.supplier_count);
    const top=s.top_supplier;
    $("topSupplier").textContent=top?.name||"—";
    $("topSupplier").title=top?.name||"No approved PO commitments";
    $("topSupplierShare").textContent=top?`${php(top.amount)} · ${Number(top.share_percent||0).toFixed(1)}%` : "No approved PO commitments";
    $("averageNote").textContent=`Based on ${number(data.period?.months_in_average)} elapsed month(s)`;
    renderBars(data.monthly||[],data.period?.year||state.year,state.quarter);
    renderSuppliers(Array.isArray(data.suppliers)?data.suppliers:[]);
    renderStatuses("prPie","prLegend",data.pr_status,"No Purchase Requests for this period.");
    renderStatuses("poPie","poLegend",data.po_status,"No Purchase Orders for this period.");
    renderCategories(data.spend_by_category);
    $("filterSummary").textContent=describePeriod(state.year,state.quarter);
    updateYears(data.available_years);
  }
  async function load() {
    const myRequest=++pendingRequest;
    $("reportError").hidden=true;
    $("filterButton").disabled=true;
    state.loading=true;
    try {
      const query=new URLSearchParams({year:state.year,quarter:state.quarter});
      const response=await fetch(`${PHP}?${query.toString()}`,{method:"GET",credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
      let data;
      try{data=await response.json();}catch{throw new Error(`Invalid API response (HTTP ${response.status}).`);}
      if(!response.ok||!data?.success)throw new Error(data?.message||`HTTP ${response.status}`);
      if(myRequest!==pendingRequest)return;
      state.data=data;
      render(data);
    }catch(e){
      if(myRequest!==pendingRequest)return;
      state.data=null;
      $("reportError").textContent=e.message||"Unable to load reports.";
      $("reportError").hidden=false;
      toast("Manager Reports could not load. Check the PHP endpoint.");
    }finally{
      if(myRequest===pendingRequest){$("filterButton").disabled=false;state.loading=false;}
    }
  }
  function hideFilter() {$("filterPopup").hidden=true;$("filterButton").setAttribute("aria-expanded","false");}
  $("filterButton").addEventListener("click",()=>{
    const f=$("filterPopup");f.hidden=!f.hidden;
    $("filterButton").setAttribute("aria-expanded",String(!f.hidden));
  });
  $("filterPopup").addEventListener("submit",e=>{
    e.preventDefault();
    const year=Number($("yearFilter").value),quarter=Number($("quarterFilter").value);
    if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(quarter)||quarter<0||quarter>4){toast("Choose a valid year and quarter.");return;}
    state.year=year;state.quarter=quarter;hideFilter();load();
  });
  $("resetFilter").addEventListener("click",()=>{state.year=currentYear;state.quarter=0;hideFilter();load();});
  document.addEventListener("click",e=>{if(!e.target.closest(".filter-holder"))hideFilter();});
  $("notificationButton").addEventListener("click",()=>toast("Manager notifications are not connected yet."));
  $("signOutButton").addEventListener("click",()=>toast("Sign-out is managed by HR; no Procurement logout action is configured."));
  document.querySelectorAll("[data-soon]").forEach(b=>b.addEventListener("click",()=>toast(`${b.dataset.soon} is not connected yet.`)));
  $("exportPdf").addEventListener("click",()=>{
    if(!state.data){toast("Load the report before exporting.");return;}
    window.print();
  });
  function csvCell(value) {
    let s=String(value??"");
    if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s; // Excel formula injection mitigation.
    return `"${s.replace(/"/g,'""')}"`;
  }
  $("exportExcel").addEventListener("click",()=>{
    const d=state.data;
    if(!d){toast("Load the report before exporting.");return;}
    const rows=[
      ["UniProcur Manager Procurement Report"],
      ["Period",describePeriod(state.year,state.quarter)],
      ["Basis","Approved PO commitments, not Finance-posted expenses"],
      [],["SUMMARY","VALUE"],
      ["Total Procurement Commitments",Number(d.summary?.total_commitment||0)],
      ["Average Commitment per Month",Number(d.summary?.average_per_month||0)],
      ["Registered Suppliers",Number(d.summary?.supplier_count||0)],
      ["Top Supplier",d.summary?.top_supplier?.name||"Not available"],
      [],["MONTHLY APPROVED PO COMMITMENTS","AMOUNT (PHP)"],
      ...months.map((m,i)=>[`${m} ${state.year}`,Number(d.monthly?.[i]||0)]),
      [],["SUPPLIERS","TOTAL ORDERS","ON-TIME DELIVERY","RATING","STATUS","APPROVED PO COMMITMENT (PHP)"],
      ...(d.suppliers||[]).map(s=>[s.supplier_name,s.total_orders,s.on_time_percent??"Unavailable",s.rating??"Unavailable",s.performance_status,s.commitment_amount]),
      [],["PR STATUS","COUNT"],...Object.entries(d.pr_status||{}),
      [],["PO STATUS","COUNT"],...Object.entries(d.po_status||{}),
      [],["SPEND BY CATEGORY","APPROVED PO LINE AMOUNT (PHP)"],
      ...(d.spend_by_category||[]).map(c=>[c.name,c.amount]),
    ];
    const csv="\ufeff"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const link=make("a");link.href=url;link.download=`uniprocur-manager-reports-${state.year}-q${state.quarter}.csv`;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  load();
});
