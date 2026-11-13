/* UniProcur Buyer bell notifications v1.
   Uses ONLY stored Finance decision audit rows and actual local Inventory GR rows.
   Does not generate demo events or call Finance approval/Inventory receiving actions. */
'use strict';
(() => {
  if (window.__uniProcurBuyerNotifications) return;
  window.__uniProcurBuyerNotifications = true;
  const ENDPOINT = '../database/buyer-notifications.php';
  const state = { notifications:[], unread:0, csrf:'', busy:false, opened:false, error:'', warnings:[], sources:{} };
  let trigger, panel, badge, list, status, markAll, heading, pending;
  const make = (tag, cls, value) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (value !== undefined) element.textContent = String(value);
    return element;
  };
  function prettyDate(value) {
    const raw = String(value || '').trim();
    const dt = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(dt.getTime()) ? raw : dt.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function setBadge() {
    if (!badge) return;
    badge.hidden = !state.unread;
    badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
    if (trigger) trigger.setAttribute('aria-label', state.unread ? `Notifications, ${state.unread} unread` : 'Notifications, no unread messages');
  }
  function setPosition() {
    if (!trigger || !panel) return;
    const box = trigger.getBoundingClientRect();
    const width = Math.min(380, Math.max(280, window.innerWidth - 22));
    const left = Math.max(11, Math.min(window.innerWidth - width - 11, box.right - width));
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.min(window.innerHeight - 80, box.bottom + 12)}px`;
  }
  function render() {
    if (!list || !heading) return;
    heading.textContent = state.unread ? `Notifications (${state.unread} unread)` : 'Notifications';
    list.replaceChildren();
    markAll.disabled = state.busy || !state.notifications.some(n => !n.read);
    if (state.error) {
      list.append(make('p','uni-notif-error',state.error));
      return;
    }
    if (!state.notifications.length) {
      list.append(make('p','uni-notif-empty','No Finance decisions or confirmed Inventory receipts yet.'));
    } else {
      state.notifications.forEach(n => {
        const card = make('article','uni-notif-item' + (n.read ? '' : ' is-unread'));
        const top = make('div','uni-notif-item-top');
        const category = make('span','uni-notif-category',n.category);
        const when = make('time','uni-notif-time',prettyDate(n.occurred_at));
        top.append(category,when);
        const title = make('strong','uni-notif-title',n.title);
        const body = make('p','uni-notif-message',n.message);
        const actions = make('div','uni-notif-item-actions');
        const open = make('a','uni-notif-open','View details');
        // Only server-provided same-directory relative URLs are allowed.
        if (typeof n.url === 'string' && /^(?:award-confirmation|comparison-matrix|buyer-real-goods-receipts)\.html\?/.test(n.url)) {
          open.href=n.url;
        } else { open.href='buyer-dashboard.html'; }
        open.addEventListener('click', async e => {
          if (n.read) return;
          e.preventDefault();
          const dest=open.href;
          try { await markRead([n.key]); } catch (err) { console.warn('Mark read before navigation:',err); }
          window.location.assign(dest);
        });
        actions.append(open);
        if (!n.read) {
          const read = make('button','uni-notif-mark','Mark read');
          read.type='button';
          read.addEventListener('click',async()=>{
            read.disabled=true;
            try { await markRead([n.key]); } catch(e) { state.error=e.message;render(); }
          });
          actions.append(read);
        }
        card.append(top,title,body,actions);
        list.append(card);
      });
    }
    if (state.warnings.length) {
      const wrapper=make('div','uni-notif-warnings');
      state.warnings.forEach(w=>wrapper.append(make('p','',w)));
      list.append(wrapper);
    }
  }
  async function load() {
    if (pending || document.hidden) return;
    pending=true;
    try {
      const response=await fetch(ENDPOINT,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const data=await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || `Notifications HTTP ${response.status}`);
      state.notifications=Array.isArray(data.notifications)?data.notifications:[];
      state.unread=Number(data.unread_count)||0;
      state.csrf=data.csrf_token||'';
      state.warnings=Array.isArray(data.warnings)?data.warnings:[];
      state.sources=data.source_status||{};
      state.error='';
    } catch (err) {
      // Do not invent a zero count after a failed API response.
      state.error=err.message||'Notifications could not be loaded.';
      console.warn('Buyer notifications:',err);
    } finally {
      pending=false;
      setBadge();
      if (state.opened) render();
    }
  }
  async function markRead(keys) {
    if (!state.csrf) throw new Error('Notification session unavailable. Reload this page.');
    const response=await fetch(ENDPOINT,{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-Token':state.csrf},
      body:JSON.stringify({keys})
    });
    const data=await response.json();
    if (!response.ok||!data.success) throw new Error(data.message||'Could not mark notifications as read.');
    const readSet=new Set(keys);
    state.notifications.forEach(n=>{if(readSet.has(n.key)) n.read=true;});
    state.unread=state.notifications.reduce((sum,n)=>sum+(n.read?0:1),0);
    state.error='';
    setBadge();render();
  }
  function toggle(force) {
    state.opened=typeof force==='boolean'?force:!state.opened;
    panel.hidden=!state.opened;
    trigger.setAttribute('aria-expanded',String(state.opened));
    if(state.opened){setPosition();render();load();}
  }
  function init() {
    // Existing Figma headers vary: button, icon button, and non-interactive span.
    const header=document.querySelector('header');
    if(!header) return;
    let bell=header.querySelector('button#notificationButton, button#bellButton, button.notification-button, button.bell-button, button.br-bell, button.bell, .notification-button, .bell-button, .br-bell, .bell');
    if(!bell) return;
    if(bell.tagName.toLowerCase()!=='button') {
      const replacement=make('button',bell.className);
      replacement.type='button';
      replacement.classList.add('uni-notif-from-span');
      while (bell.firstChild) replacement.appendChild(bell.firstChild);
      replacement.setAttribute('aria-label','Notifications');
      bell.replaceWith(replacement);
      bell=replacement;
    }
    trigger=bell;
    trigger.type='button';
    trigger.classList.add('uni-notif-trigger');
    trigger.setAttribute('aria-haspopup','true');
    trigger.setAttribute('aria-expanded','false');
    trigger.removeAttribute('aria-hidden');
    trigger.removeAttribute('data-toast');
    // Existing hardcoded bell toast handlers must not run.
    trigger.addEventListener('click', e=>{
      e.preventDefault();e.stopImmediatePropagation();toggle();
    },true);
    badge=make('span','uni-notif-badge');
    badge.hidden=true;
    badge.setAttribute('aria-hidden','true');
    trigger.append(badge);

    panel=make('section','uni-notif-panel');
    panel.setAttribute('aria-label','Buyer notifications');
    panel.hidden=true;
    const head=make('div','uni-notif-head');
    heading=make('h2','uni-notif-heading','Notifications');
    const close=make('button','uni-notif-close','×');
    close.type='button';close.setAttribute('aria-label','Close notifications');
    close.addEventListener('click',()=>toggle(false));
    head.append(heading,close);
    status=make('p','uni-notif-subtitle','Finance decisions and actual Inventory receipts');
    list=make('div','uni-notif-list');
    markAll=make('button','uni-notif-mark-all','Mark all as read');
    markAll.type='button';markAll.disabled=true;
    markAll.addEventListener('click',async()=>{
      const keys=state.notifications.filter(n=>!n.read).map(n=>n.key);
      if (!keys.length) return;
      markAll.disabled=true;
      try { await markRead(keys); } catch(e) { state.error=e.message;render(); }
    });
    const foot=make('div','uni-notif-footer');foot.append(markAll);
    panel.append(head,status,list,foot);
    document.body.append(panel);
    document.addEventListener('click',e=>{
      if (state.opened && !panel.contains(e.target) && !trigger.contains(e.target)) toggle(false);
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.opened){toggle(false);trigger.focus();}});
    window.addEventListener('resize',()=>{if(state.opened)setPosition();});
    window.addEventListener('focus',load);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
    load();
    window.setInterval(load,30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
