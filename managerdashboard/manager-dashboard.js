"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const peso = value => new Intl.NumberFormat("en-PH", {style:"currency", currency:"PHP", minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(value) || 0);
  const number = value => new Intl.NumberFormat("en-PH").format(Number(value) || 0);
  const date = value => {
    if (!value) return "—";
    const dt = new Date(String(value).slice(0, 10) + "T00:00:00");
    return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-PH", {month:"short",day:"2-digit",year:"numeric"});
  };
  const node = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = String(content);
    return element;
  };
  let toastTimer;
  const toast = message => {
    const t = $("dashboardToast");
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  };
  function renderIdentity(manager) {
    
const name = "Manager";
const email = "manager@gmail.com";
const letter = "M";
const first = "Manager";

$("welcomeText").textContent = "Welcome Manager!";

    for (const id of ["sidebarManagerName", "topbarManagerName"]) $(id).textContent = name;
    for (const id of ["sidebarManagerEmail", "topbarManagerEmail"]) $(id).textContent = email;
    for (const id of ["sidebarAvatar", "topbarAvatar"]) $(id).textContent = letter;
  }
  function renderSummary(summary) {
    $("totalSuppliers").textContent = number(summary.suppliers);
    $("requestsThisMonth").textContent = number(summary.requests_this_month);
    $("pendingPrs").textContent = number(summary.pending_prs);
    $("purchaseOrders").textContent = number(summary.purchase_orders);
    $("poStatusNote").textContent = `${number(summary.pending_pos)} awaiting approval`;
  }
  // Count chart, not a peso/budget chart. The Manager API uses the same
  // one-PO-once successful-purchase rule as the Buyer Dashboard.
  function formatTick(value) {
    return String(Math.round(value));
  }
  function niceAxisCeiling(maxValue) {
    if (maxValue <= 4) return 4;
    return Math.ceil(maxValue / 4) * 4;
  }
  function renderSuccessfulPurchases(monthly) {
    const values = Array.isArray(monthly?.values) && monthly.values.length === 12
      ? months.map((_, i) => Math.max(0, Math.floor(Number(monthly.values[i]) || 0)))
      : months.map(() => 0);
    const axisMax = niceAxisCeiling(Math.max(...values));
    const year = Number(monthly?.year) || new Date().getFullYear();
    $("chartYear").textContent = String(year);
    $("monthlyAmount").textContent = `${number(monthly?.current_month_count)} successful purchase(s) this month`;
    $("monthlyBasis").textContent = "One Purchase Order counted once after an approved / posted / paid / completed invoice";
    const change = monthly?.change_from_previous_month_pct;
    const delta = $("monthlyChange");
    delta.className = "monthly-change";
    if (change === null || change === undefined) delta.textContent = "No prior-month comparison";
    else {
      const diff = Number(change);
      delta.textContent = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}% vs last month`;
      delta.classList.add(diff >= 0 ? "positive" : "negative");
    }
    const side = $("chartYAxis"); side.replaceChildren();
    for (let i = 4; i >= 0; i--) side.append(node("span", "", formatTick(axisMax * i / 4)));
    const labels = $("chartMonths"); labels.replaceChildren();
    months.forEach(m => labels.append(node("span", "", m)));
    const svgNS = "http://www.w3.org/2000/svg";
    const grid = $("chartGrid"); grid.replaceChildren();
    const base = 218, top = 8;
    for (let i = 0; i <= 4; i++) {
      const y = top + (base - top) * i / 4;
      const line = document.createElementNS(svgNS, "line");
      for (const [key, value] of Object.entries({x1:0, x2:1000, y1:y, y2:y, stroke:"#dedede", "stroke-dasharray":"5 7", "stroke-width":1.6})) line.setAttribute(key, value);
      grid.append(line);
    }
    const points = values.map((v,i) => ({x:1000*i/11, y:base-(v/axisMax)*(base-top), value:v, month:months[i]}));
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const a=points[i-1], b=points[i], ease=(b.x-a.x)*.38;
      d += ` C ${a.x+ease} ${a.y}, ${b.x-ease} ${b.y}, ${b.x} ${b.y}`;
    }
    $("chartLine").setAttribute("d", d);
    $("chartArea").setAttribute("d", `${d} L 1000 ${base} L 0 ${base} Z`);
    const group = $("chartPoints"); group.replaceChildren();
    points.forEach(p => {
      if (!p.value) return;
      const c=document.createElementNS(svgNS,"circle");
      c.setAttribute("cx",p.x); c.setAttribute("cy",p.y); c.setAttribute("r",3.4);
      c.setAttribute("fill","#ee0909"); c.setAttribute("stroke","#fff"); c.setAttribute("stroke-width",2);
      const title=document.createElementNS(svgNS,"title");
      title.textContent=`${p.month}: ${p.value} successful purchase(s)`;
      c.append(title); group.append(c);
    });
    const hasData=values.some(v=>v>0);
    $("chartNote").textContent = hasData
      ? `Successful purchases for ${year}. Counts distinct POs with eligible invoice status. Grouped by earliest eligible invoice record date, not Finance approval date.`
      : `No successful purchases for ${year} with approved/posted/paid/completed invoices yet. Ready to Post and classroom DEMO do not count.`;
  }
  function statusName(input) {
    const s=String(input||"").toLowerCase();
    const names={submitted:"Pending",pending:"Pending",pending_approval:"Pending Approval",approved:"Approved",rejected:"Rejected",issued:"Issued",partial:"Partially Received",received:"Received",closed:"Closed"};
    return names[s] || s.replaceAll("_", " ") || "—";
  }
  function statusTag(value) {
    const status=String(value||"").toLowerCase();
    return node("span", `status-pill ${status}`, statusName(status));
  }
  function reviewPrUrl(pr) {
    const n=encodeURIComponent(pr.pr_number || "");
    if (pr.status === "approved") return `manager-request-approved.html?pr=${n}`;
    if (pr.status === "rejected") return `manager-request-rejected.html?pr=${n}`;
    return `manager-view-purchase-request.html?pr=${n}`;
  }
  function renderPrs(prs) {
    const tbody=$("recentPrRows");tbody.replaceChildren();
    if (!prs.length) {
      const tr=node("tr"),td=node("td","empty-row","No submitted Purchase Requests yet.");td.colSpan=5;tr.append(td);tbody.append(tr);return;
    }
    prs.forEach(pr=>{
      const tr=node("tr");
      for(const val of [pr.pr_number,date(pr.created_date),date(pr.required_date)]) tr.append(node("td","",val||"—"));
      const statusTd=node("td");statusTd.append(statusTag(pr.status));tr.append(statusTd);
      const actionTd=node("td"),a=node("a","review-button","Review");a.href=reviewPrUrl(pr);actionTd.append(a);tr.append(actionTd);
      tbody.append(tr);
    });
  }
  function renderPos(orders) {
    const container=$("recentPoCards");container.replaceChildren();
    if(!orders.length){container.append(node("p","loading-note","No submitted Purchase Orders yet."));return;}
    orders.forEach(po=>{
      const card=node("article","po-mini-card");
      const header=node("div","po-mini-head"),block=node("div");
      block.append(node("strong","",po.po_number||"Purchase Order"),node("b","",po.supplier_name||"Supplier not recorded"));
      header.append(block,statusTag(po.status));
      const body=node("div","po-mini-body");
      for(const [label,val] of [["Order Date",date(po.order_date||po.created_date)],["Total Amount",peso(po.total_amount)],["Expected Delivery",date(po.expected_delivery)],["Status",statusName(po.status)]]){
        const entry=node("div");entry.append(node("small","",label),node("strong","",val));body.append(entry);
      }
      const foot=node("div","po-mini-footer"),review=node("a","review-button","Review");
      review.href=`manager-view-purchase-order.html?po_number=${encodeURIComponent(po.po_number||"")}`;foot.append(review);
      card.append(header,body,foot);container.append(card);
    });
  }
  $("notificationButton").addEventListener("click", () => toast("Manager notifications are not connected yet."));
  $("signOutButton").addEventListener("click", () => toast("Sign-out is managed by the HR login module; no Procurement logout action has been configured."));
  document.querySelectorAll("[data-soon]").forEach(b=>b.addEventListener("click",()=>toast(`${b.dataset.soon} is not connected yet.`)));
  async function loadDashboard() {
    const response=await fetch("../database/get-manager-dashboard.php", {method:"GET",credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
    let data;
    try {data=await response.json();} catch {throw new Error(`Unable to read dashboard response (HTTP ${response.status}).`);}
    if(!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);
    renderIdentity(data.manager);
    renderSummary(data.summary || {});
    renderSuccessfulPurchases(data.monthly || {});
    renderPrs(Array.isArray(data.recent_prs)?data.recent_prs:[]);
    renderPos(Array.isArray(data.recent_pos)?data.recent_pos:[]);
  }
  window.setInterval(() => { if (!document.hidden) loadDashboard().catch(error => console.warn('Manager dashboard refresh:', error)); }, 30000);
  loadDashboard().catch(error=>{
    console.error("Manager dashboard:",error);
    const err=$("dashboardError");err.textContent=error.message;err.hidden=false;
    $("recentPrRows").replaceChildren();const row=node("tr"),td=node("td","empty-row","Failed to load live Purchase Requests.");td.colSpan=5;row.append(td);$("recentPrRows").append(row);
    $("recentPoCards").replaceChildren(node("p","loading-note","Unable to load Purchase Orders."));
    $("chartNote").textContent="The graph is unavailable until the Manager API responds.";
  });
});
