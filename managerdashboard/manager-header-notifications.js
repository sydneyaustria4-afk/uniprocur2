/* Manager PO approval bell, powered by saved Procurement events. Does not approve anything. */
'use strict';
(() => {
  if (window.__uniManagerPONotifications) return;
  window.__uniManagerPONotifications=true;
  const API='../database/manager-notifications.php';
  const state={items:[],unread:0,csrf:'',open:false,error:'',loading:false};
  let bell,panel,badge,list,heading,markAll;
  const mk=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el;};
  function time(raw){const d=new Date(String(raw||'').replace(' ','T'));return Number.isNaN(+d)?String(raw||''):d.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  function updateBadge(){if(!badge)return;badge.hidden=!state.unread;badge.textContent=state.unread>99?'99+':String(state.unread);bell.setAttribute('aria-label',state.unread?`Notifications, ${state.unread} unread`:'Notifications');}
  function place(){if(!bell||!panel)return;const p=bell.getBoundingClientRect(),w=Math.min(380,Math.max(280,innerWidth-22));panel.style.width=w+'px';panel.style.left=Math.max(11,Math.min(innerWidth-w-11,p.right-w))+'px';panel.style.top=Math.min(innerHeight-80,p.bottom+12)+'px';}
  function render(){
    if(!panel)return;
    heading.textContent=state.unread?`Notifications (${state.unread} unread)`:'Notifications';
    markAll.disabled=state.loading||!state.items.some(n=>!n.read);
    list.replaceChildren();
    if(state.error){list.append(mk('p','uni-notif-error',state.error));return;}
    if(!state.items.length){list.append(mk('p','uni-notif-empty','No Purchase Orders awaiting your approval.'));return;}
    state.items.forEach(n=>{
      const card=mk('article','uni-notif-item'+(n.read?'':' is-unread'));
      const top=mk('div','uni-notif-item-top');
      top.append(mk('span','uni-notif-category',n.category),mk('time','uni-notif-time',time(n.occurred_at)));
      const msg=mk('p','uni-notif-message',n.message);
      const links=mk('div','uni-notif-item-actions');
      const open=mk('a','uni-notif-open','Review PO');
      open.href=typeof n.url==='string'&&/^manager-view-purchase-order\.html\?po_number=PO-[A-Za-z0-9%-]+$/.test(n.url)?n.url:'manager-purchase-orders.html';
      open.addEventListener('click',async e=>{
        if(n.read)return;e.preventDefault();const dst=open.href;
        try{await markRead([n.key]);}catch(error){console.warn('Mark read:',error);}location.assign(dst);
      });
      links.append(open);
      if(!n.read){const btn=mk('button','uni-notif-mark','Mark read');btn.type='button';btn.addEventListener('click',async()=>{btn.disabled=true;try{await markRead([n.key]);}catch(e){state.error=e.message;render();}});links.append(btn);}
      card.append(top,mk('strong','uni-notif-title',n.title),msg,links);list.append(card);
    });
  }
  async function load(){
    if(document.hidden||state.loading)return;state.loading=true;
    try{const r=await fetch(API,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||`HTTP ${r.status}`);state.items=Array.isArray(d.notifications)?d.notifications:[];state.unread=Number(d.unread_count)||0;state.csrf=d.csrf_token||'';state.error='';}
    catch(e){state.error=e.message||'Unable to load notifications.';console.warn('Manager PO bell:',e);}
    finally{state.loading=false;updateBadge();if(state.open)render();}
  }
  async function markRead(keys){
    const r=await fetch(API,{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-Token':state.csrf},body:JSON.stringify({keys})});const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'Mark read failed');
    const set=new Set(keys);state.items.forEach(n=>{if(set.has(n.key))n.read=true;});state.unread=state.items.filter(n=>!n.read).length;state.error='';updateBadge();render();
  }
  function toggle(force){state.open=typeof force==='boolean'?force:!state.open;panel.hidden=!state.open;bell.setAttribute('aria-expanded',String(state.open));if(state.open){place();render();load();}}
  function init(){
    const header=document.querySelector('header');
    if(!header)return;
    bell=header.querySelector('button#notificationButton, button.notification-button, button.bell, button[data-coming-soon="Notifications"], .notification-button');
    if(!bell)return;
    if(bell.tagName.toLowerCase()!=='button'){
      const b=mk('button',bell.className);b.type='button';while(bell.firstChild)b.append(bell.firstChild);bell.replaceWith(b);bell=b;
    }
    bell.type='button';bell.classList.add('uni-notif-trigger');bell.removeAttribute('data-coming-soon');bell.setAttribute('aria-haspopup','true');bell.setAttribute('aria-expanded','false');
    // Capture phase suppresses legacy "coming soon" toasts.
    bell.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();toggle();},true);
    badge=mk('span','uni-notif-badge');badge.hidden=true;badge.setAttribute('aria-hidden','true');bell.append(badge);
    panel=mk('section','uni-notif-panel');panel.setAttribute('aria-label','Manager Purchase Order notifications');panel.hidden=true;
    const head=mk('div','uni-notif-head');heading=mk('h2','uni-notif-heading','Notifications');const close=mk('button','uni-notif-close','×');close.type='button';close.setAttribute('aria-label','Close notifications');close.addEventListener('click',()=>toggle(false));head.append(heading,close);
    const subtitle=mk('p','uni-notif-subtitle','Purchase Orders submitted for Manager approval');
    list=mk('div','uni-notif-list');markAll=mk('button','uni-notif-mark-all','Mark all as read');markAll.type='button';markAll.disabled=true;markAll.addEventListener('click',async()=>{const keys=state.items.filter(n=>!n.read).map(n=>n.key);if(!keys.length)return;markAll.disabled=true;try{await markRead(keys);}catch(e){state.error=e.message;render();}});
    const foot=mk('div','uni-notif-footer');foot.append(markAll);panel.append(head,subtitle,list,foot);document.body.append(panel);
    document.addEventListener('click',e=>{if(state.open&&!panel.contains(e.target)&&!bell.contains(e.target))toggle(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open){toggle(false);bell.focus();}});
    addEventListener('resize',()=>{if(state.open)place();});addEventListener('focus',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();setInterval(load,30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
